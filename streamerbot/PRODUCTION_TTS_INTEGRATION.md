# Production TTS integration

This runbook connects the live-tested `ASAdventurerActorHelper.cs` methods to an existing Streamer.bot TTS workflow without replacing the current TTS generator or playback actions.

The integration begins with one actor identity. Add the remaining identities only after the first production path passes.

## Current checkpoint

The first production identity, `gnisu`, passed the complete production lifecycle on 2026-08-01:

```text
StartTts
→ actor entered speaking
→ Kokoro direct blocking playback completed
→ StopTts
→ actor returned to idle
```

The successful run used the repository helper that posts directly to `/api/actors/<actorId>/state`. The earlier duplicate File Watcher playback and stale capability-discovery helper problems were removed from the successful path.

The next gate is documented in `streamerbot/MULTI_ACTOR_TTS_TEST.md`.

## Preconditions

- Secure LAN mode is running.
- The actor OBS source is connected.
- `streamerbot/ASAdventurerActorHelper.cs` is compiled in Streamer.bot.
- `SetExpression`, `StartTts`, `StopTts`, reset, emote, sub-emote, release, and stale-session behavior passed the helper smoke test.
- The actor token is stored in a persisted Streamer.bot global variable.
- The production TTS workflow already generates and plays audio successfully without the actor helper.

Do not edit or replace the existing TTS generator solely to add actor state. The helper calls wrap the existing playback path.

## Identity mapping worksheet

Use `streamerbot/actor-tts-mapping.example.json` as a documentation-only worksheet. It records:

- the production TTS identity key;
- the actor ID;
- the name of the persisted Streamer.bot global containing the actor token;
- the default expression; and
- the speaking timeout.

Never put a raw actor token or complete authenticated OBS URL in the worksheet. The helper does not load this JSON automatically; Streamer.bot actions remain the runtime source of configuration.

## Stage 1: inventory the existing production action

Before changing the action, identify these exact points:

```text
Production TTS action name
Argument or variable that identifies the speaker/voice
Sub-action that generates or resolves the audio
Sub-action that starts playback
Sub-action or event that confirms playback completed
Error, cancellation, and timeout cleanup paths
Existing non-actor overlay path
```

The actor start call belongs immediately before audible playback. The actor stop call belongs after playback completion and in every cleanup path that can end an active playback.

## Stage 2: wire one actor identity

Start with one actor and one production TTS identity.

### Resolve the actor configuration

When the selected TTS identity matches the actor, set local arguments:

```text
actorBaseUrl = https://localhost:3000
actorId = <actor ID copied from the AI Actors card>
actorExpression = neutral
actorExpiresInMs = <playback safety timeout, normally 45000-300000>
```

Load the persisted global containing the raw actor token into the local argument:

```text
actorToken
```

Record only the global variable name in documentation. Do not copy its value into an action name, log message, repository file, or screenshot.

### Start speaking immediately before playback

Add **Execute C# Method**:

```text
Code source: AS Adventurer Actor Helper
Method: StartTts
Save Result to Variable: On
Variable Name: actorMethodResult
```

Place it after the audio is ready but immediately before the playback sub-action.

Do not require the actor request to succeed before playing TTS. Audio should continue through the existing production path even when the actor overlay is temporarily unavailable. The saved output arguments provide diagnostics without breaking speech generation.

Expected successful outputs:

```text
actorMethodResult = True
actorRequestSuccess = True
actorRequestStatusCode = 200
actorSpeechSessionId = non-empty
actorRequestError = empty
```

`StartTts()` stores the active session ID in the actor-scoped non-persisted global used by a separate stop action. It does not store the actor token.

### Stop speaking after playback

After successful playback completion, set the same:

```text
actorBaseUrl
actorId
actorToken
```

Then add **Execute C# Method**:

```text
Code source: AS Adventurer Actor Helper
Method: StopTts
Save Result to Variable: On
Variable Name: actorMethodResult
```

The stop action may omit `actorSpeechSessionId`. The helper reads the current actor-scoped session stored by `StartTts()`.

Expected successful outputs:

```text
actorMethodResult = True
actorRequestSuccess = True
actorRequestStatusCode = 200
actorRequestStale = False
actorRequestError = empty
```

## Stage 3: add cleanup coverage

Every path that can end or abandon playback must call `StopTts()` with the same actor configuration:

- normal completion;
- audio generation failure after a successful start;
- playback failure;
- cancellation;
- timeout; and
- an action-level exception or early exit after speaking began.

A delayed stop from an older playback is safe. The server returns `stale: true` and leaves the newer session speaking.

Do not call `ResetActor()` as the ordinary TTS completion path. Reset also clears expression and emote state. Use `StopTts()` for normal speech cleanup.

## Stage 4: preserve non-actor fallback

When the TTS identity has no actor mapping:

```text
Do not set actor credentials
Do not call StartTts or StopTts
Continue through the existing non-actor overlay behavior
```

Actor integration must be additive. Existing human, guest, narrator, or unmapped TTS identities should behave exactly as before.

## Stage 5: add remaining actors

After the first actor path passes, add one mapping block per identity. Each block resolves:

```text
TTS identity
actorId
persisted actor-token global name
default expression
speaking timeout
```

All identities may call the same compiled helper. Sessions are actor-scoped, so one actor's stop request does not stop another actor.

## Playback ownership requirement

The production action must be the sole playback owner for generated audio that it invokes directly.

For direct Kokoro or OpenAI playback:

```text
Use ttsAudioPath
Enable finish-playing-before-continuing
Disable the matching generated-file File Watcher trigger
Do not also invoke a fullPath-based playback path for the same file
```

This guarantees that `StopTts()` runs after the audio actually finishes rather than after a duplicate or estimated playback path.

## First production checkpoint

Run one real TTS request for the first mapped actor and verify:

```text
Correct actor entered speaking before audio began
Audio played through the existing TTS path
Correct actor returned to idle after audio completed
actorRequestStatusCode was 200 for start and stop
actorRequestStale was False for the matching stop
No token appeared in logs or output arguments
An unmapped TTS identity still used the original overlay path
```

Then run two back-to-back requests for the same actor. Confirm a delayed completion from the older request cannot stop the newer request.

The `gnisu` mapped path passed the normal production start, blocking Kokoro playback, and stop cycle. Multi-actor overlap, unmapped fallback, and production stale-session isolation remain in the next gate.

## Stage 6: multi-actor production isolation

Follow `streamerbot/MULTI_ACTOR_TTS_TEST.md` to:

- map a second identity to a different actor;
- verify each identity activates only its assigned actor;
- overlap the two actors and verify one completion cannot stop the other;
- repeat back-to-back requests for stale-session protection;
- exercise expression and emote actor scope; and
- verify an unmapped identity remains on the original path.

## Information to record after a checkpoint

Record only non-secret results:

```text
Production TTS action name
Identity argument name
Mapped identity label
Actor ID suffix or redacted actor ID
Start status code
Stop status code
Stop stale value
Actor entered speaking before playback: yes/no
Actor returned to idle after playback: yes/no
Unmapped fallback unchanged: yes/no
```

Never record the actor token, persisted-global value, or complete authenticated OBS URL.
