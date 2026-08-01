# Serial multi-actor production TTS validation

This runbook records the production release gate after the first actor identity passed. The validated mapped identities are `gnisu` and `dascribe`.

Production TTS intentionally uses one serial queue. One voice completes actor start, blocking playback, and actor stop before the next queued voice begins. This keeps streams clean and understandable. Simultaneous production speech is not supported or required.

The goal of this test is to prove that identity routing remains isolated across the accepted serial queue and that unmapped identities keep their original non-actor playback path.

## Security rules

- Keep raw actor tokens in persisted Streamer.bot globals.
- Record only persisted-global names in documentation or test notes.
- Do not paste complete authenticated OBS URLs into logs, screenshots, or repository files.
- Clear the local `actorToken` argument after each helper call.

## Preconditions

- Secure LAN mode is running at the configured private origin.
- The latest `streamerbot/ASAdventurerActorHelper.cs` is compiled under the code-source name `AS Adventurer Actor Helper`.
- Production TTS uses direct blocking playback through `ttsAudioPath`.
- File Watcher playback is disabled for files that the production action plays directly.
- The `gnisu` production start, playback, and stop cycle passes.
- Two actor OBS browser sources are connected and visibly distinguishable.

## Configure the second identity

Choose one existing production TTS identity other than `gnisu` and assign it to a different actor.

Create or confirm these persisted globals locally:

```text
asActorId_<second-identity> = <second actor ID>
asActorToken_<second-identity> = <second actor token>
```

Optional persisted globals:

```text
asActorExpression_<second-identity> = neutral
asActorExpiresInMs_<second-identity> = 120000
```

Do not add a mapping for the identity reserved for the unmapped fallback test.

## Test A: first mapped identity

Run one normal `gnisu` TTS request.

Expected:

```text
Only the gnisu-assigned actor enters speaking
The second actor remains idle
Playback uses the existing Kokoro production action
The gnisu-assigned actor returns to idle after playback
Start and stop return HTTP 200
The matching stop reports stale = false
```

## Test B: second mapped identity

Run one normal request for the second mapped identity.

Expected:

```text
Only the second assigned actor enters speaking
The gnisu-assigned actor remains idle
Playback completes through the identity's existing production playback action
The second actor returns to idle after playback
Start and stop return HTTP 200
The matching stop reports stale = false
```

## Test C: serial queue isolation

Submit mapped requests close together so the second request enters the queue while the first is still active.

Expected:

```text
The second request waits in the production queue
Only one actor is speaking at any moment
The first actor stops after its own blocking playback
The second actor starts only after the first actor has stopped
Each identity controls only its assigned actor
The queue drains cleanly after the final stop
```

This test replaces the earlier overlap proposal. Overlap is not applicable because the accepted production design deliberately serializes all voices.

## Test D: unmapped fallback

Run one production TTS request using an identity with no actor mapping.

Expected:

```text
actorProductionMapped = false
No actor enters speaking
No actor token is loaded
No StartTts or StopTts request is sent
The original non-actor TTS and overlay behavior remains unchanged
Audio still plays successfully through direct blocking playback
```

## Actor-scope regression checks

Actor-scoped expression, reset, emote, sub-emote, release, cross-action session lookup, and stale-session protection are helper and actor-API checks. They were exercised separately during the live helper validation.

The production serial queue prevents concurrent same-identity cleanup, so a production back-to-back stale-stop race is not applicable. The helper's stale-session protection remains required and already passed its dedicated live test.

Expected actor-scope behavior remains:

```text
An expression change affects only the targeted actor
An emote trigger affects only the targeted actor
Releasing or resetting one actor does not alter the other actor
A stale stop cannot clear a newer actor speech session
```

## Non-secret evidence to record

```text
First mapped identity label
Second mapped identity label
Redacted actor ID or actor ID suffix for each mapping
Playback action used by each identity
Start status code for each actor
Stop status code for each actor
Stop stale value for normal completion
Queued mapped identities remained isolated: yes/no
Only one actor spoke at a time: yes/no
Unmapped fallback remained unchanged: yes/no
Previously validated actor-scope helper checks remain passed: yes/no
No token appeared in logs: yes/no
```

## Acceptance gate

The serial multi-actor production gate passes when:

- both mapped identities activate only their assigned actors;
- speaking begins before each mapped identity's audible playback and returns to idle afterward;
- requests queued close together are processed one at a time without cross-actor state changes;
- an unmapped identity remains on the existing non-actor path;
- the independently validated actor-scoped expression, emote, and stale-session protections remain intact; and
- no raw actor token appears in logs or repository files.

After this gate passes, update `project-status.json`, `next-steps.json`, and `CHANGELOG.md`, then advance to the LAN-enabled Windows package build.
