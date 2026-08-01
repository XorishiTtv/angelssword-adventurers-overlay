# Project status and roadmap

AS Adventurer keeps its active state in `project-status.json`, `next-steps.json`, and `repository-checks.json`. These records do not affect overlay runtime behavior; `npm run status:check` reads them together with local Git metadata.

## Current state

The original secure LAN and AI Actor integration remains merged and validated on `main`. Development has resumed on draft PR #9 to let each AI character discover and select controls for its own actor.

The feature branch is:

```text
agent/ai-self-actor-controls
```

The foundation now includes:

- actor-token-authenticated `GET /api/actors/:actorId/capabilities`;
- dynamic reporting of dedicated installed assets for the existing logical expressions;
- URL-free Type 1, Type 2, and nested sub-emote catalogs;
- a companion Streamer.bot capability helper; and
- a documented hidden `ACTOR_CONTROL:` protocol and security boundary.

The AI must never receive actor IDs, actor tokens, machine tokens, base URLs, OBS URLs, asset URLs, token hashes, certificate material, or filesystem paths. Raw actor tokens remain persisted Streamer.bot globals.

## Validation completed on this branch

- `node --check` passed for `actor-capabilities-mode.js` and `lan-global-server.js`.
- A local filesystem and authentication harness verified dedicated expression discovery.
- The harness verified Type 1, Type 2, and nested sub-emote discovery.
- The harness rejected invalid authentication.
- The capability response contained no token, token hash, media filename, or asset URL.
- Structural delimiter checks passed for the companion C# helper source.

The companion helper has not yet been compiled in Streamer.bot. No CI pass is claimed.

## Immediate next step

Install and compile the personalized UniversalBot integration, then carry the validated visual intent through the existing serial TTS queue.

The queue item must retain its own actor key and visual intent so later AI replies cannot overwrite earlier pending messages. Apply the selected expression or emote immediately before playback, preserve Actor Helper speech-session cleanup, and release held Type 2 emotes after speech when requested.

The personalized UniversalBot integration script is intentionally distributed outside the public repository because it contains channel-specific behavior and local bot workflow details.

## Remaining validation

- compile and exercise `ASAdventurerActorCapabilitiesHelper.cs` in Streamer.bot;
- verify valid and malformed hidden lines never appear in Twitch or TTS text;
- verify unlisted expressions, emotes, paths, and cross-actor attempts are rejected;
- verify multiple queued AI replies retain the correct actor intent;
- verify TTS failure cleanup returns actors to idle and releases held emotes;
- repeat remote browser, OBS, LAN restart, and Windows package regression.

## Active checkout contract

```text
Repository:     XorishiTtv/angelssword-adventurers-overlay
Working branch: agent/ai-self-actor-controls
Base branch:    main
Pull request:   #9 (draft)
Expected head:  origin/agent/ai-self-actor-controls
Expected base:  origin/main
```

Update and verify the local checkout with:

```powershell
git status --short
git fetch --prune origin
git switch agent/ai-self-actor-controls
git pull --ff-only origin agent/ai-self-actor-controls
npm ci
npm run status:check
```

## Promotion rule

PR #9 remains draft and unmerged. Marking it ready and merging it are separate actions, each requiring explicit owner approval after the runtime, queue, security, package, and remote OBS gates pass.
