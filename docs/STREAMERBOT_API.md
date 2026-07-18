# Streamer.bot and AI API

AS Adventurer exposes a localhost-only versioned API on the same port as the control panel. The examples below assume the default port, `3000`.

## REST quick start

Read current state:

```http
GET http://127.0.0.1:3000/api/v1/state
```

Force a temporary reaction:

```http
PUT http://127.0.0.1:3000/api/v1/state/override
Content-Type: application/json

{
  "state": "surprised",
  "speaking": true,
  "durationMs": 5000
}
```

Return to automatic tracking:

```http
DELETE http://127.0.0.1:3000/api/v1/state/override
```

Trigger an emote:

```http
POST http://127.0.0.1:3000/api/v1/emotes/wave/trigger
Content-Type: application/json

{
  "durationMs": 8000
}
```

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Version, uptime, port, clients, and tracking status |
| `GET` | `/api/v1/state` | Canonical model, expression, voice, override, emote, and config state |
| `GET` | `/api/v1/capabilities` | Discover states, models, emotes, and supported commands |
| `PUT` | `/api/v1/state/override` | Force `neutral`, `happy`, `sad`, `surprised`, `eyes_closed`, or `typing` |
| `DELETE` | `/api/v1/state/override` | Return to automatic tracking |
| `PUT` | `/api/v1/voice` | Set `speaking` and `typing` booleans |
| `GET`, `PUT` | `/api/v1/config` | Read or update overlay config |
| `GET`, `PUT` | `/api/v1/thresholds` | Read or update expression thresholds |
| `PUT` | `/api/v1/models/{name}/active` | Select an existing model |
| `GET` | `/api/v1/models/{name}/emotes` | List a model's emotes |
| `POST` | `/api/v1/emotes/{name}/trigger` | Trigger an emote |
| `POST` | `/api/v1/emotes/release` | Release the active emote |
| `POST` | `/api/v1/emotes/sub` | Trigger a nested sub-animation path |
| `POST` | `/api/v1/commands` | Execute an allowlisted AI/automation command |

## Command endpoint

The command endpoint gives AI actions and generic Streamer.bot integrations one stable request shape.

```json
{
  "version": 1,
  "requestId": "raid-alert-1842",
  "command": "state.override",
  "args": {
    "state": "surprised",
    "durationMs": 5000
  },
  "source": "streamer.bot"
}
```

Supported commands:

- `state.get`
- `state.override`
- `state.auto`
- `voice.set`
- `model.select`
- `emote.trigger`
- `emote.release`
- `emote.sub`
- `config.set`
- `thresholds.set`

A repeated `requestId` returns the original result with `duplicate: true` instead of executing the command again. Request IDs are retained for five minutes.

## WebSocket client

Connect Streamer.bot to:

```text
ws://127.0.0.1:3000?type=streamerbot
```

The server sends a `hello` message containing the current state. Send commands with:

```json
{
  "type": "command",
  "id": "sb-3948",
  "command": "voice.set",
  "args": {
    "speaking": true,
    "typing": false
  }
}
```

The response uses the same ID:

```json
{
  "type": "command.result",
  "id": "sb-3948",
  "status": "ok",
  "result": {
    "command": "voice.set",
    "state": {}
  }
}
```

Streamer.bot clients also receive structured events such as:

- `expression.changed`
- `voice.changed`
- `state.override_changed`
- `model.changed`
- `emote.started`
- `emote.sub_changed`
- `emote.completed`
- `emote.released`
- `config.changed`
- `thresholds.changed`

## Streamer.bot C# example

```csharp
using System.Net.Http;
using System.Text;

public class CPHInline
{
    public bool Execute()
    {
        using var client = new HttpClient();
        var json = "{\"state\":\"happy\",\"durationMs\":3000}";
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = client.PutAsync(
            "http://127.0.0.1:3000/api/v1/state/override",
            content
        ).GetAwaiter().GetResult();

        return response.IsSuccessStatusCode;
    }
}
```

The server remains bound to `127.0.0.1` by default. Do not expose it to a LAN or the public internet without adding authentication and network-level access controls.
