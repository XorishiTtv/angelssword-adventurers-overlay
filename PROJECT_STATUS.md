# Project status and roadmap

AS Adventurer keeps its active state in `project-status.json`, `next-steps.json`, and `repository-checks.json`. These records do not affect overlay runtime behavior; `npm run status:check` reads them together with local Git metadata.

## Current state

The secure LAN and AI Actor integration is merged into `main`.

- PR #8 merged Phase 2 AI Actors into `agent/lan-mode` at `670e108f695ca76ec53b032a6bff51b562ef20d3`.
- PR #1 merged the combined integration into `main` at `a7c17ed75aafe34dff62d88345a75278665fd564`.
- PR #1 was marked ready and merged only after separate explicit owner approvals.
- No auto-merge was enabled.

Completed and validated areas include secure LAN registration and private assets, shared global models, AI Actor lifecycle and emotes, Streamer.bot actor controls, serial production TTS routing, overlay recovery, Windows packaging, clean-folder remote-LAN operation, and the combined post-merge regression.

Production TTS intentionally uses one serial queue. One synthesized voice completes its actor start, blocking playback, and matching stop before the next voice begins.

## Package validation

The Windows package build produced both executables, both checksum files, both launchers, certificate setup files, LAN and actor documentation, the Streamer.bot helper source, and `release/ASAdventurer.zip` at 30.5 MB.

Recorded executable checksums:

```text
ASAdventurer.exe
52fd671cab5767289e3218057024d0d3a3e4662d104a8369933ac529f8e8aa9b

ASAdventurerLAN.exe
ef35d7d20cca29ed2290ab6ae44f850c6292c66c541e5d661e942857928b14eb
```

The optional `Queri` demo model was not bundled because it was absent from `public/assets`; a restored, uploaded, or global model is required for visible character media.

## Validation summary

The owner confirmed the completed integration worked across:

- the localhost-only default launcher and ordinary control panel and overlay;
- secure LAN certificate trust, registration, global models, private uploads, model selection, and emotes;
- AI Actor creation, overlays, expressions, speaking state, reset, emotes, and nested sub-animations;
- Streamer.bot actor API access and mapped serial TTS cleanup; and
- remote main and actor OBS rendering plus LAN restart recovery.

Remote Windows browser and OBS computers must trust the generated LAN root certificate and restart browser processes. Keep the server certificate bundle and password private on the host.

## Immediate next step

Core implementation, package validation, regression testing, and mainline promotion are complete. The only immediate roadmap item is an owner decision on release administration:

- choose a version and Git tag;
- decide whether to publish the validated Windows archive as a GitHub Release; and
- decide whether the completed integration branches should be retained or deleted.

A quantitative OBS CPU/GPU baseline remains optional.

## Active checkout contract

```text
Repository:     XorishiTtv/angelssword-adventurers-overlay
Working branch: main
Base branch:    main
Merged PR:      #1
Expected head:  origin/main
Expected base:  origin/main
```

Update and verify the local checkout with:

```powershell
git status --short
git fetch --prune origin
git switch main
git pull --ff-only origin main
npm ci
npm run status:check
```

The checker verifies matching project dates, branch/base/PR consistency, current branch, remote-head equality, ahead/behind, clean worktree, base ancestry, and exactly one `next` roadmap item.

## GitHub checks

GitHub reported no commit status contexts for the PR #1 merge commit, so no CI pass is claimed. The recorded local, package, browser, OBS, and Streamer.bot validation remains the release evidence.

## Security rules

Never place live credentials, complete authenticated OBS addresses, certificate private keys, or certificate passwords in repository records, logs, screenshots, or examples.
