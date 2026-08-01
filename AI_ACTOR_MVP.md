# AI Actor MVP — Phase 1

Phase 1 adds API-controlled animated actors to secure LAN mode without changing normal localhost mode or the existing machine overlay flow.

An actor belongs to one registered LAN machine and can use either:

- a shared model such as `global:Luna` from `public/assets/Luna/`; or
- a private model such as `private:Luna` from that machine's private asset directory.

Each actor receives a separate random token. The raw token is returned only when the actor is created or its token is regenerated. The host stores only its SHA-256 hash in `machine-data/actors.json`.

## Start LAN mode

Use the normal LAN launcher:

```bash
npm run start:lan
```

or double-click `start-lan.bat` on Windows.

Phase 1 does not yet add an AI Actors control-panel card. Use the API below to create and test the first actor.

## 1. List models available to the registered machine

Copy the machine token from the **Machine Assets** card, then run:

```bash
curl.exe -k "https://OVERLAY-HOST:3000/api/actors/models?machine_token=MACHINE_TOKEN"
```

The response uses scoped model names:

```json
{
  "models": [
    {
      "name": "global:Luna",
      "displayName": "Luna",
      "scope": "global",
      "assetCount": 8
    }
  ]
}
```

Use `-k` only for an initial local certificate test. The preferred setup is to install and trust the generated LAN root certificate.

## 2. Create the first actor

```bash
curl.exe -k -X POST "https://OVERLAY-HOST:3000/api/actors?machine_token=MACHINE_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Luna\",\"model\":\"global:Luna\",\"defaultExpression\":\"neutral\"}"
```

The response includes:

- the actor ID;
- the actor control token; and
- the dedicated OBS browser-source URL.

```json
{
  "success": true,
  "actor": {
    "id": "actor-...",
    "name": "Luna",
    "activeModel": "global:Luna"
  },
  "token": "ACTOR_TOKEN",
  "obsUrl": "https://OVERLAY-HOST:3000/actor-overlay.html#actor_id=actor-...&actor_token=..."
}
```

Save the token and OBS URL immediately. The raw token cannot be recovered from the server later.

## 3. Add the actor to OBS

Create a Browser Source and paste the returned `obsUrl`.

The actor overlay accepts all of these credential forms:

```text
actor-overlay.html#actor_id=ACTOR_ID&actor_token=ACTOR_TOKEN
actor-overlay.html?actor_id=ACTOR_ID&actor_token=ACTOR_TOKEN
actor-overlay.html?actor=ACTOR_ID.ACTOR_TOKEN
```

It also repairs PowerShell JSON text where the `&` separator was written as the literal sequence `\u0026`. After updating the branch, restart LAN mode and refresh the OBS Browser Source so the new actor client is loaded.

When reading an acceptance-test credentials file, parse the JSON instead of copying the escaped raw text:

```powershell
$c = Get-Content ".\four-actor-credentials-*.json" -Raw | ConvertFrom-Json
$c.actors | Format-List name, obsUrl
```

The actor overlay reuses the existing layered renderer, including animated WebM, MP4, GIF, WebP, and PNG state assets. It does not request a camera or microphone and it ignores normal control-panel tracking broadcasts.

## 4. Set expression and start TTS speaking

Supported expressions in Phase 1:

```text
neutral
happy
sad
surprised
eyes_closed
```

Before TTS begins, generate a unique session ID and send:

```bash
curl.exe -k -X POST "https://OVERLAY-HOST:3000/api/actors/ACTOR_ID/state" ^
  -H "Authorization: Bearer ACTOR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"expression\":\"happy\",\"speaking\":true,\"speechSessionId\":\"luna-message-142\",\"expiresInMs\":45000}"
```

The overlay switches to `happy_speaking`. Missing state files use safe fallbacks, ending with `neutral_idle` when necessary.

## 5. Stop speaking when TTS finishes

Send the same session ID:

```bash
curl.exe -k -X POST "https://OVERLAY-HOST:3000/api/actors/ACTOR_ID/state" ^
  -H "Authorization: Bearer ACTOR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"speaking\":false,\"speechSessionId\":\"luna-message-142\"}"
```

A delayed stop request from an older TTS message is ignored when its session ID does not match the current speech session.

If Streamer.bot never sends the stop request, the speaking state automatically expires. The default timeout is 45 seconds and accepted values are clamped between 1 second and 5 minutes.

## Streamer.bot action sequence

For one AI response:

1. Generate a unique value such as `botName-messageId`.
2. Send the combined expression and `speaking: true` request.
3. Start the actor's TTS action.
4. Wait for the TTS action to finish.
5. Send `speaking: false` using the same session ID.
6. Optionally send a later expression-only request to return to neutral.

An expression-only request looks like:

```json
{
  "expression": "surprised"
}
```

## Reset the actor

This immediately returns the actor to its configured default expression and idle state:

```bash
curl.exe -k -X POST "https://OVERLAY-HOST:3000/api/actors/ACTOR_ID/reset" ^
  -H "Authorization: Bearer ACTOR_TOKEN"
```

## Change the actor's model

Model configuration is protected by the registered machine token rather than the actor token:

```bash
curl.exe -k -X PATCH "https://OVERLAY-HOST:3000/api/actors/ACTOR_ID?machine_token=MACHINE_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"model\":\"private:LunaAlternate\"}"
```

Connected actor overlays reload the selected model in place.

## Regenerate a lost or exposed actor token

```bash
curl.exe -k -X POST "https://OVERLAY-HOST:3000/api/actors/ACTOR_ID/token/regenerate?machine_token=MACHINE_TOKEN"
```

This disconnects overlays using the old token and returns a new token plus OBS URL.

## Phase 1 acceptance result

The four-actor automated acceptance run completed with 21 passes, 0 failures, and 3 environment-only manual checks. It covered:

- four actors using three global models and one private model;
- actor-token authentication and cross-actor rejection;
- independent expressions;
- simultaneous speaking isolation;
- stale-session rejection and correct-session stopping;
- speaking timeout recovery;
- state reset and private-model coverage.

The remaining deployment checks are visual OBS rendering, OBS CPU/GPU observation, and reconnect behavior after restarting the live LAN server.

## Storage and security

- Persistent actor profiles and token hashes: `machine-data/actors.json`
- Private models: `machine-data/assets/<machine-id>/`
- Shared models: `public/assets/`
- Runtime expression, speaking state, session IDs, and timers remain in memory and reset safely after a server restart.
- Actor tokens can read only the actor's selected model and control only that actor's state.
- Actor tokens cannot upload or delete assets, register machines, or control other actors.
- Treat actor tokens and complete actor OBS URLs like passwords.
