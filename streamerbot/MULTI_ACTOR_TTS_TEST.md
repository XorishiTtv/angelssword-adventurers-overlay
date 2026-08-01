# Multi-actor production TTS isolation test

This runbook is the release gate after the first production actor identity has passed. The first validated identity is `gnisu`; its actor entered speaking before Kokoro playback, remained active through blocking playback, and returned to idle through `StopTts()`.

The goal of this test is to prove that production identity routing and actor speech sessions remain isolated when more than one actor is configured.

## Security rules

- Keep raw actor tokens in persisted Streamer.bot globals.
- Record only persisted-global names in documentation or test notes.
- Do not paste complete authenticated OBS URLs into logs, screenshots, or repository files.
- Clear the local `actorToken` argument after each helper call.

## Preconditions

- Secure LAN mode is running at the configured private origin.
- The latest `streamerbot/ASAdventurerActorHelper.cs` is compiled under the code-source name `AS Adventurer Actor Helper`.
- The production TTS action uses direct blocking playback through `ttsAudioPath`.
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

## Test C: overlapping actors

Start a long request for `gnisu`. Before it finishes, start a long request for the second mapped identity.

Expected:

```text
Both assigned actors may speak at the same time
Each actor displays only its own speaking state
Completion of one identity returns only its assigned actor to idle
The other actor remains speaking until its own playback completes
Neither stop reports stale for its matching current session
```

This test proves that the helper's actor-scoped session global and the server's actor-scoped state do not cross actor boundaries.

## Test D: back-to-back stale-session protection

For either mapped identity:

1. Start request A.
2. Start request B for the same identity before A's delayed cleanup runs.
3. Allow A's cleanup to run.
4. Allow B's cleanup to run.

Expected:

```text
A's delayed stop returns HTTP 200 with stale = true
The actor remains speaking for request B
B's stop returns HTTP 200 with stale = false
The actor returns to idle after B completes
```

## Test E: unmapped fallback

Run one production TTS request using an identity with no actor mapping.

Expected:

```text
actorProductionMapped = false
No actor enters speaking
No actor token is loaded
No StartTts or StopTts request is sent
The original non-actor TTS and overlay behavior remains unchanged
Audio still plays successfully
```

## Actor-scope regression checks

While both mappings exist, exercise one expression or emote command against each actor.

Expected:

```text
An expression change affects only the targeted actor
An emote trigger affects only the targeted actor
Releasing or resetting one actor does not alter the other actor
A TTS stop for one actor does not clear the other actor's active session
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
Overlapping actors remained isolated: yes/no
Back-to-back stale protection passed: yes/no
Unmapped fallback remained unchanged: yes/no
Expression and emote scope passed: yes/no
No token appeared in logs: yes/no
```

## Acceptance gate

The multi-actor production gate passes only when:

- both mapped identities activate only their assigned actors;
- overlapping playback does not cause cross-actor stops;
- stale cleanup from an older request cannot stop a newer request for the same actor;
- an unmapped identity remains on the existing path; and
- actor expressions and emotes remain isolated.

After this gate passes, update `project-status.json`, `next-steps.json`, and `CHANGELOG.md`, then advance to the LAN-enabled Windows package build.