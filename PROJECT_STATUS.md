# Project status and roadmap

AS Adventurer keeps its active state in `project-status.json`, `next-steps.json`, and `repository-checks.json`. These records do not affect overlay runtime behavior; `npm run status:check` reads them together with local Git metadata.

## Current state

Phase 2 AI Actors was merged through PR #8 into `agent/lan-mode` at merge commit:

```text
670e108f695ca76ec53b032a6bff51b562ef20d3
```

The active integration pull request is draft PR #1 from `agent/lan-mode` into `main`.

Completed and live-tested areas include:

- secure LAN machine registration, private assets, shared global models, and authenticated OBS URLs;
- AI Actor creation, lifecycle, expressions, speaking state, actor-scoped emotes, and nested sub-animations;
- Streamer.bot helper compilation and all seven named methods;
- overlay recovery and signed-media playback compatibility;
- production TTS routing for `gnisu` and `dascribe` through the accepted serial queue;
- unmapped OpenAI fallback playback;
- the LAN-enabled Windows package build;
- a clean-folder remote-LAN smoke test with browser and OBS clients on another computer; and
- the post-merge combined LAN regression on `agent/lan-mode`.

Production TTS intentionally uses one serial queue. One synthesized voice completes its actor start, blocking playback, and matching stop before the next voice begins. Overlap is not a release requirement.

## Package validation

The Windows package build produced:

- `ASAdventurer.exe`;
- `ASAdventurerLAN.exe`;
- both checksum files;
- both launchers;
- certificate setup files;
- LAN, actor, and Streamer.bot documentation;
- `streamerbot/ASAdventurerActorHelper.cs`; and
- `release/ASAdventurer.zip` at 30.5 MB.

The Archiver 8 ZIP paths use `ZipArchive`, and both the initial and final ZIP stages passed.

Recorded executable checksums:

```text
ASAdventurer.exe
52fd671cab5767289e3218057024d0d3a3e4662d104a8369933ac529f8e8aa9b

ASAdventurerLAN.exe
ef35d7d20cca29ed2290ab6ae44f850c6292c66c541e5d661e942857928b14eb
```

## Clean-folder and combined regression validation

The release ZIP was extracted outside the repository and run with the server on one computer and browser/OBS clients on another LAN computer.

The remote browser loaded the main and actor overlays. OBS initially showed transparent sources because the generated LAN root certificate was not trusted on the OBS computer. Installing the generated root certificate there and restarting browser and OBS processes restored trusted HTTPS rendering.

After PR #8 merged, the owner confirmed the combined `agent/lan-mode` branch was in working order across:

- the localhost-only default launcher and ordinary control panel/overlay;
- secure LAN certificate trust, registration, global models, private uploads, model selection, and emotes;
- AI Actor creation, overlays, expressions, speaking state, reset, emotes, and nested sub-animations;
- Streamer.bot actor API access and mapped serial TTS cleanup; and
- remote main and actor OBS rendering plus LAN restart recovery.

The optional `Queri` demo model was not bundled because it was absent from `public/assets`; a restored, uploaded, or global model is required for visible character media.

## Immediate next step

Combined regression validation is complete. The only immediate roadmap item is the explicit owner decision for PR #1 promotion to `main`.

PR #1 remains **open, draft, mergeable, and unmerged**. Marking it ready and merging it are separate actions and each requires an explicit owner instruction.

## Active checkout contract

```text
Repository:     XorishiTtv/angelssword-adventurers-overlay
Working branch: agent/lan-mode
Base branch:    main
Pull request:   #1
Expected head:  origin/agent/lan-mode
Expected base:  origin/main
```

After fetching, local `HEAD` must equal the expected remote head:

```powershell
git status --short
git fetch --prune origin
git switch agent/lan-mode
git pull --ff-only origin agent/lan-mode
npm ci
npm run status:check
```

The checker verifies matching project dates, branch/base/PR consistency, current branch, remote-head equality, ahead/behind, clean worktree, base ancestry, and exactly one `next` roadmap item.

## GitHub checks

At the recorded regression-complete snapshot, PR #1 was open, draft, and mergeable, with no reported commit status contexts. No CI pass is being claimed; documented local and live validation remains the release evidence.

## Security rules

Never place machine tokens, actor tokens, complete authenticated OBS URLs, certificate private keys, or certificate passwords in repository records, logs, screenshots, or examples.

For remote Windows browser or OBS computers, install only the generated root certificate and restart browser processes. Keep the server PFX and password file private on the host.
