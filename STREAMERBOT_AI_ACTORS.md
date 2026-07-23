# Streamer.bot AI Actor Helper

`streamerbot/ASAdventurerActorHelper.cs` is a reusable Streamer.bot inline-C# helper for controlling an AS Adventurer AI Actor without rebuilding JSON or HTTP requests in every action.

It provides seven callable methods:

- `StartTts()` — optionally changes expression, starts speaking, creates a session ID, and applies a safety timeout.
- `StopTts()` — stops the matching speech session and preserves stale-session protection.
- `SetExpression()` — changes expression without changing speaking state.
- `ResetActor()` — returns the actor to its configured default expression, idle state, and no active emote.
- `TriggerEmote()` — triggers a model emote by name.
- `ReleaseEmote()` — releases the actor's active emote.
- `TriggerSubEmote()` — triggers a slash-separated nested sub-animation while its parent emote is active.

`Execute()` can dispatch the same operations using `actorCommand`: `start`, `stop`, `expression`, `reset`, `emote`, `release_emote`, or `sub_emote`.

## Requirements

- Streamer.bot with **Execute C# Code** and **Execute C# Method** support.
- A created AI Actor from the secure LAN control panel.
- The actor ID and one-time actor token.
- The generated LAN certificate trusted on the computer running Streamer.bot.

The helper uses Streamer.bot's built-in `Newtonsoft.Json` dependency and .NET `HttpClient`; no additional DLL is needed.

## Install the helper

1. In Streamer.bot, create an action named **AS Adventurer Actor Helper**.
2. Add an **Execute C# Code** sub-action.
3. Set its **Name** to `AS Adventurer Actor Helper` so it can be selected by **Execute C# Method** sub-actions.
4. Paste the complete contents of `streamerbot/ASAdventurerActorHelper.cs` into the editor.
5. Select **Find Refs**, then **Compile**.
6. Enable **Precompile on Application Start** after the first successful compile.

The helper is designed for Streamer.bot's standard `CPHInline` class. The `EXTERNAL_EDITOR` branch is included only for users editing with the Streamer.bot Visual Studio Code project template.

## Required arguments

Set these arguments before calling any helper method:

| Argument | Example | Purpose |
|---|---|---|
| `actorBaseUrl` | `https://localhost:3000` | AS Adventurer secure LAN origin, without a trailing path |
| `actorId` | `actor-1234abcd...` | Actor ID copied from the AI Actors card |
| `actorToken` | actor token | One-time actor secret returned at creation or regeneration |

Do not use the machine token. The helper calls the actor-token API.

Use a hostname or IP included in the LAN certificate. When Streamer.bot and AS Adventurer run on the same computer, `https://localhost:3000` is recommended.

The helper rejects public Internet hosts and rejects plain HTTP for non-loopback hosts so an actor token is not accidentally sent outside the private LAN or in clear text.

## Recommended token storage

Store each actor token as a **persisted global variable** in Streamer.bot and load it into the local `actorToken` argument before calling the helper. Example global names:

```text
asActorTokenQueri
asActorTokenCathelyn
asActorTokenBotThree
asActorTokenBotFour
```

Treat Streamer.bot's data folder and backups as sensitive because persisted globals can contain the raw token. The helper itself never writes actor tokens to arguments, globals, response output, or logs.

## Start TTS

Optional arguments for `StartTts()`:

| Argument | Default | Purpose |
|---|---:|---|
| `actorExpression` | unchanged | `neutral`, `happy`, `sad`, `surprised`, or `eyes_closed` |
| `actorExpiresInMs` | `45000` | Safety timeout, clamped from 1,000 to 300,000 ms |
| `actorSpeechSessionId` | generated | Supply a session ID or let the helper create one |

Recommended action sequence:

```text
Set actorBaseUrl
Set actorId
Load actorToken from a persisted global
Set actorExpression
Set actorExpiresInMs
Execute C# Method -> StartTts
Run the actor's TTS sub-action
Execute C# Method -> StopTts
```

`StartTts()` writes the generated session ID to the local `actorSpeechSessionId` argument. It also stores that session ID—not the token—in a non-persisted global named:

```text
as-adventurer-actor-session:<actorId>
```

That allows a separate TTS-finished action to call `StopTts()` without manually transferring the session ID. Non-persisted globals are cleared when Streamer.bot exits.

## Stop TTS

Call `StopTts()` after the TTS action finishes.

The helper uses `actorSpeechSessionId` when present. Otherwise, it reads the actor's current non-persisted session global. A delayed stop for an older session remains safe: the server returns `stale: true`, the current speaking session continues, and the helper does not clear the newer stored session.

## Set expression only

Set `actorExpression`, then call `SetExpression()`:

```text
actorExpression = surprised
Execute C# Method -> SetExpression
```

This does not alter speaking state.

## Actor emotes

The actor's selected model must contain the emote folder.

### Trigger an emote

```text
actorEmote = wave
Execute C# Method -> TriggerEmote
```

The name must match the folder directly under the model's `emotes` directory.

### Release the active emote

```text
Execute C# Method -> ReleaseEmote
```

Type 2 emotes play their configured outro before returning to the expression layer. Type 1 emotes normally finish automatically, but release can still clear the current emote state.

### Trigger a nested sub-animation

First trigger the Type 2 parent emote, then set a slash-separated path:

```text
actorEmote = campfire
Execute C# Method -> TriggerEmote

actorSubEmote = sparks
Execute C# Method -> TriggerSubEmote
```

For deeper nesting:

```text
actorSubEmote = menu/confirm
```

A sub-animation request fails when no parent emote is active or the path does not exist under the active emote.

## Reset

Call `ResetActor()` to return the actor to its configured default expression, idle state, and no active emote. The helper also clears the actor's stored non-persisted speech session.

## Command-dispatch mode

Instead of separate **Execute C# Method** sub-actions, call the helper's normal `Execute()` method and set one of:

```text
actorCommand = start
actorCommand = stop
actorCommand = expression
actorCommand = reset
actorCommand = emote
actorCommand = release_emote
actorCommand = sub_emote
```

`actorEmote` is required for `emote`; `actorSubEmote` is required for `sub_emote`.

Named methods are recommended because they are easier to read in Streamer.bot's action list.

## Output arguments

Every request populates:

| Argument | Type | Meaning |
|---|---|---|
| `actorRequestSuccess` | bool | Request completed with an HTTP success status |
| `actorRequestStatusCode` | int | HTTP response code, or `0` for local validation/connection failures |
| `actorRequestResponse` | string | Raw server response body; never contains the submitted token |
| `actorRequestError` | string | Parsed error message when unsuccessful |
| `actorRequestStale` | bool | An old stop request was safely ignored |
| `actorSpeechSessionId` | string | Generated or supplied session ID for start/stop coordination |

Enable **Save Result to Variable** on the Streamer.bot C# sub-action when later sub-actions should continue even after a helper method returns `false`.

## Four-bot layout

Create one small configuration block per bot that sets its `actorId` and loads its token. All bots can call the same compiled helper code. Speech-session globals and actor-emote state are actor-scoped, so one bot's TTS or emote action does not control another bot.

## Troubleshooting

### `actor token required`

The value in `actorToken` is missing, expired, belongs to another actor, or is the machine token. Regenerate the actor token in the AI Actors card and update the corresponding Streamer.bot persisted global.

### Certificate or connection error

Open the secure control panel from the Streamer.bot computer and confirm the LAN certificate is trusted. The helper intentionally does not disable TLS validation. The URL hostname must also appear in the certificate; use `localhost` when both programs run on the same PC.

### `emote not found for this actor model`

Confirm the actor's selected model contains `emotes/<actorEmote>/` and a valid Type 1 `animation.*` or Type 2 `idle.*` asset.

### `no emote is active for this actor`

Call `TriggerEmote()` for the parent Type 2 emote before calling `TriggerSubEmote()`.

### Stop says no active session

Call `StartTts()` first, pass the original `actorSpeechSessionId`, or ensure the start and stop actions use the same actor ID.

### HTTP 404

Confirm `actorBaseUrl` contains only the origin, such as `https://localhost:3000`, and that the actor has not been deleted.
