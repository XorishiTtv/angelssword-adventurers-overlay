# AI self-controlled actors

This phase lets each AI character choose a visual reaction for its own AS Adventurer actor while keeping actor credentials outside the model prompt and response.

## Security boundary

The AI receives only a sanitized list of expression names, emote names, emote types, and nested sub-emote paths. It never receives the actor ID, actor token, machine token, base URL, OBS URL, asset URL, token hash, certificate material, or filesystem path.

Actor tokens remain in persisted Streamer.bot globals. The AS Adventurer server continues to store only token hashes in `machine-data/actors.json`.

## Capabilities endpoint

The LAN server exposes an actor-token-authenticated endpoint:

```text
GET /api/actors/:actorId/capabilities
Authorization: Bearer <actor token>
```

The response is deliberately URL-free:

```json
{
  "actorId": "actor-example",
  "model": "global:Example",
  "defaultExpression": "neutral",
  "expressions": [
    { "name": "neutral", "idle": true, "speaking": true },
    { "name": "happy", "idle": true, "speaking": true }
  ],
  "emotes": [
    { "name": "wave", "emoteType": 1, "subs": [] },
    {
      "name": "sword_draw",
      "emoteType": 2,
      "subs": [
        { "name": "ignition", "subs": [
          { "name": "slash", "subs": [] }
        ] }
      ]
    }
  ]
}
```

Only expressions with dedicated installed assets are advertised. The current renderer protocol still uses `neutral`, `happy`, `sad`, `surprised`, and `eyes_closed`; arbitrary expression names are not introduced by this phase.

## Capability Helper

`streamerbot/ASAdventurerActorCapabilitiesHelper.cs` is a companion Streamer.bot action for capability discovery. It exposes:

```text
GetCapabilities
GetExpressions
GetEmotes
```

Its normal `Execute()` method calls `GetCapabilities()`. The existing `ASAdventurerActorHelper.cs` remains responsible for state, speech sessions, reset, emotes, release, and nested sub-emotes.

Capability requests publish:

```text
actorCapabilitiesJson
actorExpressionsText
actorEmotesText
actorSubEmotesText
actorCapabilitiesPrompt
```

`actorCapabilitiesPrompt` contains only sanitized names and is suitable for injection into the AI system prompt.

## Streamer.bot globals

A shared base URL and per-identity mappings are recommended:

```text
asActorBaseUrl
asActorEnabled:<actor-key>
asActorId:<actor-key>
asActorToken:<actor-key>
```

Example actor keys are `gnisu`, `dascribe`, `echoofgnije`, and `zytheris`. Raw token values must remain persisted Streamer.bot globals and must not be placed in source files, logs, screenshots, prompts, or status records.

## UniversalBot profile block

Add this non-secret block to each `bot_profile.json`:

```json
{
  "actorControl": {
    "enabled": true,
    "actorKey": "gnisu",
    "baseUrlGlobalName": "asActorBaseUrl",
    "actorEnabledGlobalPrefix": "asActorEnabled:",
    "actorIdGlobalPrefix": "asActorId:",
    "actorTokenGlobalPrefix": "asActorToken:",
    "capabilityCacheSeconds": 60
  }
}
```

The integrated UniversalBot script fetches capabilities before OpenAI, caches them briefly, and injects a constrained actor-control block into the system prompt.

## Hidden command format

The AI may append at most one final line:

```text
ACTOR_CONTROL: {"endpoint":"actor.set_expression","expression":"happy"}
ACTOR_CONTROL: {"endpoint":"actor.trigger_emote","emote":"wave"}
ACTOR_CONTROL: {"endpoint":"actor.trigger_sub_emote","emote":"sword_draw","subEmote":"ignition/slash"}
ACTOR_CONTROL: {"endpoint":"actor.release_emote"}
```

UniversalBot strips every `ACTOR_CONTROL:` line before title handling, Twitch output, and TTS. It validates the first well-formed command against the fetched capabilities. Invalid or malformed commands are discarded without suppressing the visible reply.

The parent emote and nested path are separate. For an active `sword_draw` emote, the server expects `ignition/slash`, not `sword_draw/ignition/slash`.

## UniversalBot output arguments

The integrated script publishes namespaced intent fields:

```text
aiActorControlAvailable
aiActorControlSelected
aiActorKey
aiActorControlEndpoint
aiActorExpression
aiActorEmote
aiActorSubEmote
aiActorEmoteType
aiActorReleaseAfterSpeech
```

It also maps the selected intent to the existing helper arguments:

```text
actorCommand
actorExpression
actorEmote
actorSubEmote
actorReleaseAfterSpeech
```

It does not publish the actor token, actor ID, or base URL.

## TTS queue integration

The visual intent should be copied into the same immutable queue item as the generated reply and voice identity. The current production queue remains serial.

Recommended playback order:

1. Generate all TTS audio.
2. Resolve the queued identity to its actor credentials.
3. Apply the selected expression or emote immediately before playback.
4. For a sub-emote command, trigger the parent held emote before the nested path when it is not already active.
5. Call `StartTts()` with the matching expression when applicable.
6. Play all audio chunks.
7. Call `StopTts()` with the matching speech-session ID.
8. Release a held Type 2 emote when `actorReleaseAfterSpeech` is true.

The speech-session ID and timeout remain owned by Actor Helper and TTSSystem. The AI does not control them.

## Failure behavior

- Capability lookup failure: the AI still replies, but no actor command is accepted.
- Malformed hidden line: the line is removed and the visible reply continues.
- Stale model catalog: the server rejects invalid commands; refresh capabilities before retrying.
- TTS failure: the cleanup path must still call `StopTts()` and release a held emote when required.
- Cross-actor attempt: the fixed identity mapping and actor-token authentication prevent one AI from controlling another actor.

## Validation required before promotion

- Capability authentication rejects absent, invalid, and cross-actor tokens.
- Responses contain no raw token, token hash, asset URL, media filename, or private path.
- Installed expression detection matches dedicated model assets.
- Type 1, Type 2, and nested sub-emote catalogs are accurate.
- UniversalBot strips valid and malformed control lines from Twitch and TTS text.
- One AI cannot select another actor or an unlisted expression/emote.
- Queue entries retain the correct actor intent under multiple pending AI replies.
- Start/stop session cleanup and LAN/OBS recovery continue to pass.
