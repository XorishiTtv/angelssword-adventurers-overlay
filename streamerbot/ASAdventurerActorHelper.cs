using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

#if EXTERNAL_EDITOR
public class ASAdventurerActorHelper : CPHInlineBase
#else
public class CPHInline
#endif
{
    private const int DefaultTimeoutSeconds = 30;
    private const int DefaultSpeakingTimeoutMs = 45000;
    private const int MinimumSpeakingTimeoutMs = 1000;
    private const int MaximumSpeakingTimeoutMs = 300000;
    private const string SessionGlobalPrefix = "as-adventurer-actor-session:";

    private static readonly HttpClient Client = CreateHttpClient();

    private sealed class ActorConfiguration
    {
        public Uri BaseUri { get; set; }
        public string ActorId { get; set; }
        public string ActorToken { get; set; }
    }

    private sealed class RequestResult
    {
        public bool Success { get; set; }
        public int StatusCode { get; set; }
        public string ResponseBody { get; set; }
        public bool Stale { get; set; }
    }

    private static HttpClient CreateHttpClient()
    {
        HttpClient client = new HttpClient();
        client.Timeout = TimeSpan.FromSeconds(DefaultTimeoutSeconds);
        return client;
    }

    public void Init()
    {
        Client.DefaultRequestHeaders.Clear();
    }

    public bool Execute()
    {
        string command = GetStringArg("actorCommand", string.Empty).Trim().ToLowerInvariant();
        switch (command)
        {
            case "start":
            case "starttts":
            case "start_tts":
                return StartTts();
            case "stop":
            case "stoptts":
            case "stop_tts":
            case "idle":
                return StopTts();
            case "expression":
            case "setexpression":
            case "set_expression":
                return SetExpression();
            case "reset":
            case "resetactor":
            case "reset_actor":
                return ResetActor();
            case "emote":
            case "triggeremote":
            case "trigger_emote":
                return TriggerEmote();
            case "releaseemote":
            case "release_emote":
            case "emote_release":
                return ReleaseEmote();
            case "subemote":
            case "triggersubemote":
            case "trigger_sub_emote":
                return TriggerSubEmote();
            default:
                return Fail("Set actorCommand to start, stop, expression, reset, emote, release_emote, or sub_emote, or call a named helper method.");
        }
    }

    public bool StartTts()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            string expression = GetStringArg("actorExpression", string.Empty).Trim().ToLowerInvariant();
            if (!string.IsNullOrEmpty(expression) && !IsSupportedExpression(expression))
            {
                return Fail("actorExpression must be neutral, happy, sad, surprised, or eyes_closed.");
            }

            int expiresInMs = GetIntArg("actorExpiresInMs", DefaultSpeakingTimeoutMs);
            expiresInMs = Math.Max(MinimumSpeakingTimeoutMs, Math.Min(MaximumSpeakingTimeoutMs, expiresInMs));

            string sessionId = GetStringArg("actorSpeechSessionId", string.Empty).Trim();
            if (string.IsNullOrEmpty(sessionId))
            {
                sessionId = CreateSessionId(config.ActorId);
            }

            JObject body = new JObject
            {
                ["speaking"] = true,
                ["speechSessionId"] = sessionId,
                ["expiresInMs"] = expiresInMs
            };
            if (!string.IsNullOrEmpty(expression))
            {
                body["expression"] = expression;
            }

            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/state", body);
            PublishResult(result, sessionId);
            if (!result.Success)
            {
                return false;
            }

            CPH.SetGlobalVar(SessionGlobalName(config.ActorId), sessionId, false);
            CPH.LogInfo("AS Adventurer actor started speaking: " + config.ActorId + " session " + sessionId);
            return true;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public bool StopTts()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            string sessionId = GetStringArg("actorSpeechSessionId", string.Empty).Trim();
            if (string.IsNullOrEmpty(sessionId))
            {
                sessionId = CPH.GetGlobalVar<string>(SessionGlobalName(config.ActorId), false) ?? string.Empty;
            }
            if (string.IsNullOrEmpty(sessionId))
            {
                return Fail("No active speech session was found. Pass actorSpeechSessionId or run StartTts first.");
            }

            JObject body = new JObject
            {
                ["speaking"] = false,
                ["speechSessionId"] = sessionId
            };

            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/state", body);
            PublishResult(result, sessionId);
            if (!result.Success)
            {
                return false;
            }

            if (!result.Stale)
            {
                CPH.UnsetGlobalVar(SessionGlobalName(config.ActorId), false);
            }
            CPH.LogInfo("AS Adventurer actor stop request completed: " + config.ActorId + (result.Stale ? " (stale session ignored)" : string.Empty));
            return true;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public bool SetExpression()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            string expression = GetStringArg("actorExpression", string.Empty).Trim().ToLowerInvariant();
            if (!IsSupportedExpression(expression))
            {
                return Fail("actorExpression must be neutral, happy, sad, surprised, or eyes_closed.");
            }

            JObject body = new JObject
            {
                ["expression"] = expression
            };
            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/state", body);
            PublishResult(result, null);
            if (result.Success)
            {
                CPH.LogInfo("AS Adventurer actor expression set: " + config.ActorId + " -> " + expression);
            }
            return result.Success;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public bool ResetActor()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/reset", null);
            PublishResult(result, null);
            if (!result.Success)
            {
                return false;
            }

            CPH.UnsetGlobalVar(SessionGlobalName(config.ActorId), false);
            CPH.LogInfo("AS Adventurer actor reset: " + config.ActorId);
            return true;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public bool TriggerEmote()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            string emote = GetStringArg("actorEmote", string.Empty).Trim();
            if (!IsSafeEmoteName(emote))
            {
                return Fail("actorEmote is required and must be at most 160 characters without control characters.");
            }

            JObject body = new JObject
            {
                ["name"] = emote
            };
            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/emote/trigger", body);
            PublishResult(result, null);
            if (result.Success)
            {
                CPH.LogInfo("AS Adventurer actor emote triggered: " + config.ActorId + " -> " + emote);
            }
            return result.Success;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public bool ReleaseEmote()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/emote/release", null);
            PublishResult(result, null);
            if (result.Success)
            {
                CPH.LogInfo("AS Adventurer actor emote released: " + config.ActorId);
            }
            return result.Success;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    public bool TriggerSubEmote()
    {
        try
        {
            ActorConfiguration config = ReadConfiguration();
            string subEmote = GetStringArg("actorSubEmote", string.Empty).Trim();
            if (!IsSafeSubEmotePath(subEmote))
            {
                return Fail("actorSubEmote is required. Use a slash-separated sub path with no more than 8 parts.");
            }

            JObject body = new JObject
            {
                ["name"] = subEmote
            };
            RequestResult result = SendJson(config, "/api/actors/" + Uri.EscapeDataString(config.ActorId) + "/emote/sub", body);
            PublishResult(result, null);
            if (result.Success)
            {
                CPH.LogInfo("AS Adventurer actor sub-emote triggered: " + config.ActorId + " -> " + subEmote);
            }
            return result.Success;
        }
        catch (Exception error)
        {
            return Fail(error.Message);
        }
    }

    private ActorConfiguration ReadConfiguration()
    {
        string baseUrl = GetStringArg("actorBaseUrl", string.Empty).Trim().TrimEnd('/');
        string actorId = GetStringArg("actorId", string.Empty).Trim();
        string actorToken = GetStringArg("actorToken", string.Empty).Trim();

        Uri baseUri;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out baseUri) || (baseUri.Scheme != Uri.UriSchemeHttps && baseUri.Scheme != Uri.UriSchemeHttp))
        {
            throw new InvalidOperationException("actorBaseUrl must be an absolute http or https URL, such as https://overlay-pc:3000.");
        }
        if (!IsPrivateLanHost(baseUri.Host))
        {
            throw new InvalidOperationException("actorBaseUrl must point to localhost or a private LAN host.");
        }
        if (baseUri.Scheme == Uri.UriSchemeHttp && !baseUri.IsLoopback)
        {
            throw new InvalidOperationException("Use HTTPS for a non-loopback actorBaseUrl so the actor token is not sent in clear text.");
        }
        if (string.IsNullOrEmpty(actorId) || !actorId.StartsWith("actor-", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("actorId is missing or invalid.");
        }
        if (string.IsNullOrEmpty(actorToken))
        {
            throw new InvalidOperationException("actorToken is required.");
        }

        return new ActorConfiguration
        {
            BaseUri = baseUri,
            ActorId = actorId,
            ActorToken = actorToken
        };
    }

    private RequestResult SendJson(ActorConfiguration config, string relativePath, JObject body)
    {
        Uri endpoint = new Uri(config.BaseUri, relativePath);
        using (HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, endpoint))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ActorToken);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (body != null)
            {
                request.Content = new StringContent(body.ToString(Formatting.None), Encoding.UTF8, "application/json");
            }

            using (HttpResponseMessage response = Client.SendAsync(request).GetAwaiter().GetResult())
            {
                string responseBody = response.Content == null
                    ? string.Empty
                    : response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                bool stale = false;
                if (!string.IsNullOrWhiteSpace(responseBody))
                {
                    try
                    {
                        JObject responseJson = JObject.Parse(responseBody);
                        stale = responseJson.Value<bool?>("stale") ?? false;
                    }
                    catch (JsonException)
                    {
                        // Non-JSON error responses are surfaced through actorRequestResponse.
                    }
                }

                RequestResult result = new RequestResult
                {
                    Success = response.IsSuccessStatusCode,
                    StatusCode = (int)response.StatusCode,
                    ResponseBody = responseBody,
                    Stale = stale
                };

                if (!result.Success)
                {
                    CPH.LogError("AS Adventurer actor API request failed for " + config.ActorId + ": HTTP " + result.StatusCode);
                }
                return result;
            }
        }
    }

    private void PublishResult(RequestResult result, string sessionId)
    {
        CPH.SetArgument("actorRequestSuccess", result.Success);
        CPH.SetArgument("actorRequestStatusCode", result.StatusCode);
        CPH.SetArgument("actorRequestResponse", result.ResponseBody ?? string.Empty);
        CPH.SetArgument("actorRequestStale", result.Stale);
        CPH.SetArgument("actorRequestError", result.Success ? string.Empty : ExtractError(result.ResponseBody, result.StatusCode));
        if (!string.IsNullOrEmpty(sessionId))
        {
            CPH.SetArgument("actorSpeechSessionId", sessionId);
        }
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("actorRequestSuccess", false);
        CPH.SetArgument("actorRequestStatusCode", 0);
        CPH.SetArgument("actorRequestResponse", string.Empty);
        CPH.SetArgument("actorRequestStale", false);
        CPH.SetArgument("actorRequestError", message);
        CPH.LogError("AS Adventurer actor helper: " + message);
        return false;
    }

    private string GetStringArg(string name, string fallback)
    {
        string value;
        return CPH.TryGetArg(name, out value) && value != null ? value : fallback;
    }

    private int GetIntArg(string name, int fallback)
    {
        int intValue;
        if (CPH.TryGetArg(name, out intValue))
        {
            return intValue;
        }

        string stringValue;
        int parsed;
        return CPH.TryGetArg(name, out stringValue) && int.TryParse(stringValue, out parsed) ? parsed : fallback;
    }

    private static string ExtractError(string responseBody, int statusCode)
    {
        if (!string.IsNullOrWhiteSpace(responseBody))
        {
            try
            {
                JObject responseJson = JObject.Parse(responseBody);
                string error = responseJson.Value<string>("error");
                if (!string.IsNullOrWhiteSpace(error))
                {
                    return error;
                }
            }
            catch (JsonException)
            {
                return responseBody;
            }
        }
        return "Actor API request failed with HTTP " + statusCode + ".";
    }

    private static bool IsSupportedExpression(string expression)
    {
        return expression == "neutral"
            || expression == "happy"
            || expression == "sad"
            || expression == "surprised"
            || expression == "eyes_closed";
    }

    private static bool IsSafeEmoteName(string value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && value.Length <= 160
            && value.IndexOfAny(new[] { '\0', '\r', '\n', '\t' }) < 0;
    }

    private static bool IsSafeSubEmotePath(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 1288)
        {
            return false;
        }

        string[] parts = value.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0 || parts.Length > 8)
        {
            return false;
        }

        foreach (string part in parts)
        {
            if (!IsSafeEmoteName(part.Trim()))
            {
                return false;
            }
        }
        return true;
    }

    private static string CreateSessionId(string actorId)
    {
        string value = actorId + "-" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + "-" + Guid.NewGuid().ToString("N");
        return value.Length <= 160 ? value : value.Substring(0, 160);
    }

    private static string SessionGlobalName(string actorId)
    {
        return SessionGlobalPrefix + actorId;
    }

    private static bool IsPrivateLanHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host))
        {
            return false;
        }

        string normalized = host.Trim().Trim('[', ']').ToLowerInvariant();
        if (normalized == "localhost" || normalized.EndsWith(".localhost", StringComparison.Ordinal))
        {
            return true;
        }
        if (normalized.EndsWith(".local", StringComparison.Ordinal)
            || normalized.EndsWith(".lan", StringComparison.Ordinal)
            || normalized.EndsWith(".home.arpa", StringComparison.Ordinal)
            || normalized.IndexOf('.') < 0)
        {
            return true;
        }

        IPAddress address;
        if (!IPAddress.TryParse(normalized, out address))
        {
            return false;
        }
        if (IPAddress.IsLoopback(address))
        {
            return true;
        }
        byte[] bytes = address.GetAddressBytes();
        if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
        {
            return bytes[0] == 10
                || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
                || (bytes[0] == 192 && bytes[1] == 168)
                || (bytes[0] == 169 && bytes[1] == 254);
        }
        if (address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6)
        {
            return address.IsIPv6LinkLocal || (bytes[0] & 0xFE) == 0xFC;
        }
        return false;
    }
}
