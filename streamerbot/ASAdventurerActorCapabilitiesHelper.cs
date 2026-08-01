using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

#if EXTERNAL_EDITOR
public class ASAdventurerActorCapabilitiesHelper : CPHInlineBase
#else
public class CPHInline
#endif
{
    private static readonly HttpClient Client = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(30)
    };

    public bool Execute()
    {
        return GetCapabilities();
    }

    public bool GetCapabilities()
    {
        try
        {
            Uri baseUri;
            string actorId;
            string actorToken;
            if (!ReadConfiguration(out baseUri, out actorId, out actorToken))
                return false;

            Uri endpoint = new Uri(baseUri, "/api/actors/" + Uri.EscapeDataString(actorId) + "/capabilities");
            using (var request = new HttpRequestMessage(HttpMethod.Get, endpoint))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", actorToken);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                using (HttpResponseMessage response = Client.SendAsync(request).GetAwaiter().GetResult())
                {
                    string body = response.Content == null
                        ? string.Empty
                        : response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    SetRequestResult(response.IsSuccessStatusCode, (int)response.StatusCode, body);
                    if (!response.IsSuccessStatusCode)
                    {
                        ClearCapabilityOutputs();
                        return false;
                    }

                    PublishCapabilities(body, actorId);
                    CPH.LogInfo("AS Adventurer actor capabilities loaded: " + actorId);
                    return true;
                }
            }
        }
        catch (Exception error)
        {
            ClearCapabilityOutputs();
            return Fail(error.Message);
        }
    }

    public bool GetExpressions()
    {
        return GetCapabilities();
    }

    public bool GetEmotes()
    {
        return GetCapabilities();
    }

    private bool ReadConfiguration(out Uri baseUri, out string actorId, out string actorToken)
    {
        baseUri = null;
        actorId = GetStringArg("actorId").Trim();
        actorToken = GetStringArg("actorToken").Trim();
        string baseUrl = GetStringArg("actorBaseUrl").Trim().TrimEnd('/');

        Uri parsed;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out parsed)
            || (parsed.Scheme != Uri.UriSchemeHttps && parsed.Scheme != Uri.UriSchemeHttp))
            return Fail("actorBaseUrl must be an absolute HTTP or HTTPS URL.");
        if (!IsPrivateLanHost(parsed.Host))
            return Fail("actorBaseUrl must point to localhost or a private LAN host.");
        if (parsed.Scheme == Uri.UriSchemeHttp && !parsed.IsLoopback)
            return Fail("Use HTTPS for a non-loopback actorBaseUrl.");
        if (string.IsNullOrEmpty(actorId) || !actorId.StartsWith("actor-", StringComparison.Ordinal))
            return Fail("actorId is missing or invalid.");
        if (string.IsNullOrEmpty(actorToken))
            return Fail("actorToken is required.");

        baseUri = new Uri(parsed.AbsoluteUri.TrimEnd('/') + "/");
        return true;
    }

    private void PublishCapabilities(string body, string expectedActorId)
    {
        JObject root = JObject.Parse(body ?? "{}");
        string actorId = (root.Value<string>("actorId") ?? string.Empty).Trim();
        if (!string.Equals(actorId, expectedActorId, StringComparison.Ordinal))
            throw new InvalidOperationException("Capability response actor did not match actorId.");

        var expressions = new List<string>();
        JArray expressionArray = root["expressions"] as JArray;
        if (expressionArray != null)
        {
            foreach (JToken token in expressionArray)
            {
                string name = token.Type == JTokenType.Object
                    ? token.Value<string>("name")
                    : token.ToString();
                name = (name ?? string.Empty).Trim().ToLowerInvariant();
                if (IsProtocolExpression(name) && !expressions.Contains(name, StringComparer.OrdinalIgnoreCase))
                    expressions.Add(name);
            }
        }

        var emoteLines = new List<string>();
        var subLines = new List<string>();
        JArray emoteArray = root["emotes"] as JArray;
        if (emoteArray != null)
        {
            foreach (JObject emote in emoteArray.OfType<JObject>())
            {
                string name = (emote.Value<string>("name") ?? string.Empty).Trim();
                if (!IsSafeName(name)) continue;
                int type = emote.Value<int?>("emoteType") ?? 0;
                emoteLines.Add(name + " [" + (type == 1 ? "one-shot" : type == 2 ? "held" : "unknown") + "]");
                FlattenSubs(name, emote["subs"] as JArray, string.Empty, subLines);
            }
        }

        var prompt = new StringBuilder();
        prompt.AppendLine("AVAILABLE ACTOR CONTROLS");
        prompt.AppendLine();
        prompt.AppendLine("Expressions:");
        if (expressions.Count == 0) prompt.AppendLine("- none");
        foreach (string expression in expressions) prompt.AppendLine("- " + expression);
        prompt.AppendLine();
        prompt.AppendLine("Emotes:");
        if (emoteLines.Count == 0) prompt.AppendLine("- none");
        foreach (string emote in emoteLines) prompt.AppendLine("- " + emote);
        prompt.AppendLine();
        prompt.AppendLine("Sub-emotes:");
        if (subLines.Count == 0) prompt.AppendLine("- none");
        foreach (string sub in subLines) prompt.AppendLine("- " + sub);

        CPH.SetArgument("actorCapabilitiesJson", root.ToString(Formatting.None));
        CPH.SetArgument("actorExpressionsText", string.Join("\n", expressions));
        CPH.SetArgument("actorEmotesText", string.Join("\n", emoteLines));
        CPH.SetArgument("actorSubEmotesText", string.Join("\n", subLines));
        CPH.SetArgument("actorCapabilitiesPrompt", prompt.ToString().Trim());
    }

    private static void FlattenSubs(string parentEmote, JArray subs, string prefix, List<string> output)
    {
        if (subs == null) return;
        foreach (JObject sub in subs.OfType<JObject>())
        {
            string name = (sub.Value<string>("name") ?? string.Empty).Trim();
            if (!IsSafeName(name)) continue;
            string path = string.IsNullOrEmpty(prefix) ? name : prefix + "/" + name;
            output.Add(parentEmote + " -> " + path);
            FlattenSubs(parentEmote, sub["subs"] as JArray, path, output);
        }
    }

    private void SetRequestResult(bool success, int statusCode, string responseBody)
    {
        CPH.SetArgument("actorRequestSuccess", success);
        CPH.SetArgument("actorRequestStatusCode", statusCode);
        CPH.SetArgument("actorRequestResponse", responseBody ?? string.Empty);
        CPH.SetArgument("actorRequestError", success ? string.Empty : ExtractError(responseBody, statusCode));
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("actorRequestSuccess", false);
        CPH.SetArgument("actorRequestStatusCode", 0);
        CPH.SetArgument("actorRequestResponse", string.Empty);
        CPH.SetArgument("actorRequestError", message);
        CPH.LogError("AS Adventurer capabilities helper: " + message);
        return false;
    }

    private void ClearCapabilityOutputs()
    {
        CPH.SetArgument("actorCapabilitiesJson", string.Empty);
        CPH.SetArgument("actorExpressionsText", string.Empty);
        CPH.SetArgument("actorEmotesText", string.Empty);
        CPH.SetArgument("actorSubEmotesText", string.Empty);
        CPH.SetArgument("actorCapabilitiesPrompt", string.Empty);
    }

    private string GetStringArg(string name)
    {
        string value;
        return CPH.TryGetArg(name, out value) && value != null ? value : string.Empty;
    }

    private static string ExtractError(string responseBody, int statusCode)
    {
        if (!string.IsNullOrWhiteSpace(responseBody))
        {
            try
            {
                string message = JObject.Parse(responseBody).Value<string>("error");
                if (!string.IsNullOrWhiteSpace(message)) return message;
            }
            catch (JsonException)
            {
                return responseBody;
            }
        }
        return "Actor API request failed with HTTP " + statusCode + ".";
    }

    private static bool IsProtocolExpression(string value)
    {
        return value == "neutral"
            || value == "happy"
            || value == "sad"
            || value == "surprised"
            || value == "eyes_closed";
    }

    private static bool IsSafeName(string value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && value.Length <= 160
            && value.IndexOfAny(new[] { '\0', '\r', '\n', '\t' }) < 0;
    }

    private static bool IsPrivateLanHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host)) return false;
        string normalized = host.Trim().Trim('[', ']').ToLowerInvariant();
        if (normalized == "localhost" || normalized.EndsWith(".localhost", StringComparison.Ordinal)) return true;
        if (normalized.EndsWith(".local", StringComparison.Ordinal)
            || normalized.EndsWith(".lan", StringComparison.Ordinal)
            || normalized.EndsWith(".home.arpa", StringComparison.Ordinal)
            || normalized.IndexOf('.') < 0) return true;

        IPAddress address;
        if (!IPAddress.TryParse(normalized, out address)) return false;
        if (IPAddress.IsLoopback(address)) return true;
        byte[] bytes = address.GetAddressBytes();
        if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        {
            return bytes[0] == 10
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
                || (bytes[0] == 192 && bytes[1] == 168)
                || (bytes[0] == 169 && bytes[1] == 254);
        }
        return address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6
            && (address.IsIPv6LinkLocal || (bytes[0] & 0xFE) == 0xFC);
    }
}
