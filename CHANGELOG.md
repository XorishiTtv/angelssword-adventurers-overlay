# Changelog

All notable user-visible changes to AS Adventurer are recorded here.

## Unreleased

### Added

- Opt-in secure LAN mode using HTTPS and secure WebSockets on trusted private networks.
- Machine registration with token-authenticated ownership and isolated private model storage.
- Shared read-only global models alongside machine-private uploads.
- AI Actor creation, naming, model selection, reset, token regeneration, OBS URL generation, and deletion controls.
- Actor-scoped expressions, speaking state, speech-session IDs, stale-stop protection, emotes, and nested sub-animations.
- Reusable `streamerbot/ASAdventurerActorHelper.cs` with seven named methods.
- Shared overlay recovery, inactive-media pausing, and removed-media cleanup.
- Project status, roadmap, checkout, and repository handoff records.
- Production TTS integration and serial multi-actor validation guides.

### Changed

- Production TTS uses one serial queue by design so only one synthesized voice is audible at a time.
- `gnisu` and `dascribe` are validated production actor identities; unmapped broadcaster playback remains on the original OpenAI path.
- Fresh and updated checkouts use `npm ci` and fast-forward-only pulls.
- Phase 2 AI Actors was merged through PR #8 into `agent/lan-mode` at merge commit `670e108f695ca76ec53b032a6bff51b562ef20d3`.
- The active checkout contract now uses `agent/lan-mode` against `main` through draft PR #1.
- The combined LAN regression test is the immediate promotion gate.
- PR #1 remains draft and unmerged until regression validation and separate explicit owner approval.

### Fixed

- Actor emote signed URLs retain a renderer-compatible media extension hint.
- Overlay startup and reconnection recovery use bounded retry and reload behavior.
- Duplicate TTS File Watcher playback and stale helper capability discovery were removed from the validated production paths.
- Standard and LAN release builders now use the Archiver 8 `ZipArchive` constructor API.
- Remote OBS transparency caused by an untrusted generated LAN certificate was resolved by installing the generated root certificate on the OBS computer and restarting browser processes.

### Validated

- Main and actor overlays rendered in browser and OBS through same-computer localhost and remote secure-LAN setups before the integration merge.
- Actor expression, speaking, reset, Type 2 emote, nested sub-animation, and release behavior passed live testing.
- The Streamer.bot helper compiled and all seven named methods passed live testing.
- Production `gnisu` and `dascribe` requests completed isolated start, blocking playback, and stop lifecycles through the accepted serial queue.
- An unmapped broadcaster identity retained direct blocking OpenAI playback without starting an actor.
- `ASAdventurer.exe` and `ASAdventurerLAN.exe` built successfully with `pkg` 5.8.1 and GZip compression.
- Both ZIP creation stages passed after the Archiver 8 correction.
- The final `release/ASAdventurer.zip` archive was 30.5 MB.
- Required launchers, checksum files, certificate setup, LAN and actor documentation, and the Streamer.bot helper source were present.
- A clean-folder package test ran with the server on one computer and browser/OBS clients on another LAN computer.
- The owner confirmed the main and actor OBS overlays rendered after the remote computer trusted the generated LAN root certificate.
- PR #8 merged into `agent/lan-mode` using the verified feature head `03ba6e4a1b0b779bc801597704832c499336558b`.
- GitHub reported no status contexts for the active integration pull request, so no CI pass is claimed.

### Recorded checksums

```text
ASAdventurer.exe
52fd671cab5767289e3218057024d0d3a3e4662d104a8369933ac529f8e8aa9b

ASAdventurerLAN.exe
ef35d7d20cca29ed2290ab6ae44f850c6292c66c541e5d661e942857928b14eb
```

### Remaining promotion sequence

- Run the combined localhost, secure-LAN, AI Actor, Streamer.bot, and OBS restart regression from `agent/lan-mode`.
- Mark PR #1 ready only with explicit owner approval after regression validation.
- Merge PR #1 into `main` only with a separate explicit owner instruction.
- Optionally record a quantitative OBS CPU/GPU baseline.
