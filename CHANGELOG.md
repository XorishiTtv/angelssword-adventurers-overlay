# Changelog

All notable user-visible changes to AS Adventurer are recorded here.

## Unreleased

### Added

- Opt-in secure LAN mode using HTTPS and secure WebSockets on trusted private networks.
- Machine registration with isolated private model storage and shared read-only global models.
- AI Actor creation, naming, model selection, reset, credential regeneration, OBS source generation, and deletion controls.
- Actor-scoped expressions, speaking state, speech-session IDs, stale-stop protection, emotes, and nested sub-animations.
- Reusable `streamerbot/ASAdventurerActorHelper.cs` with seven named methods.
- Shared overlay recovery, inactive-media pausing, removed-media cleanup, project records, and checkout checks.

### Changed

- Production TTS uses one serial queue by design so only one synthesized voice is audible at a time.
- `gnisu` and `dascribe` are validated production actor identities; unmapped playback retains the original fallback.
- Fresh and updated checkouts use `npm ci` and fast-forward-only pulls.
- Phase 2 AI Actors merged through PR #8 into `agent/lan-mode` at `670e108f695ca76ec53b032a6bff51b562ef20d3`.
- The combined secure LAN and AI Actor integration merged through PR #1 into `main` at `a7c17ed75aafe34dff62d88345a75278665fd564`.
- The active checkout contract now uses `main` against `origin/main`.
- Release administration is the remaining roadmap decision.

### Fixed

- Actor emote signed URLs retain a renderer-compatible media extension hint.
- Overlay startup and reconnection recovery use bounded retry and reload behavior.
- Duplicate TTS File Watcher playback and stale helper capability discovery were removed from the validated production paths.
- Standard and LAN release builders use the Archiver 8 `ZipArchive` constructor API.
- Remote OBS transparency caused by an untrusted generated LAN certificate was resolved by trusting the generated root certificate on the OBS computer and restarting browser processes.

### Validated

- Main and actor overlays rendered in browser and OBS through same-computer localhost and remote secure-LAN setups.
- Actor expression, speaking, reset, Type 2 emote, nested sub-animation, and release behavior passed live testing.
- The Streamer.bot helper compiled and all seven named methods passed live testing.
- Production `gnisu` and `dascribe` requests completed isolated start, blocking playback, and stop lifecycles through the accepted serial queue.
- An unmapped identity retained direct blocking fallback playback without starting an actor.
- `ASAdventurer.exe` and `ASAdventurerLAN.exe` built successfully with `pkg` 5.8.1 and GZip compression.
- Both ZIP creation stages passed after the Archiver 8 correction.
- The final `release/ASAdventurer.zip` archive was 30.5 MB.
- Required launchers, checksum files, certificate setup, LAN and actor documentation, and the Streamer.bot helper source were present.
- A clean-folder package test ran with the server on one computer and browser/OBS clients on another LAN computer.
- The combined branch passed owner-confirmed regression coverage for localhost mode, secure LAN registration and assets, AI Actors, Streamer.bot serial TTS, remote OBS rendering, and LAN restart recovery.
- PR #1 was marked ready and merged into `main` only after separate explicit owner instructions; no auto-merge was enabled.
- GitHub reported no status contexts for the PR #1 merge commit, so no CI pass is claimed.

### Recorded checksums

```text
ASAdventurer.exe
52fd671cab5767289e3218057024d0d3a3e4662d104a8369933ac529f8e8aa9b

ASAdventurerLAN.exe
ef35d7d20cca29ed2290ab6ae44f850c6292c66c541e5d661e942857928b14eb
```

### Remaining release administration

- Choose a version and Git tag.
- Decide whether to publish the validated Windows archive as a GitHub Release.
- Decide whether completed integration branches should be retained or deleted.
- Optionally record a quantitative OBS CPU/GPU baseline.
