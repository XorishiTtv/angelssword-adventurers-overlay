# Changelog

All notable user-visible changes to AS Adventurer are recorded here.

## Unreleased

### Added

- Opt-in secure LAN mode using HTTPS and secure WebSockets on trusted private networks.
- Machine registration with token-authenticated ownership and isolated private model storage.
- Shared read-only global models alongside machine-private uploads.
- AI Actor creation, naming, model selection, default expression, reset, token regeneration, OBS URL generation, and deletion controls.
- Actor-scoped expression and speaking state with speech-session IDs and stale-stop protection.
- Actor Type 1 one-shot emotes and Type 2 held emotes with intro, idle, speaking, outro, sound, variants, and nested sub-animations.
- Short-lived actor/model/path-scoped signed media URLs for machine-owner emote controls.
- Reusable `streamerbot/ASAdventurerActorHelper.cs` with seven named methods and command-dispatch aliases.
- Shared overlay runtime recovery for transient asset failures, empty overlays, and actor reconnects.
- Inactive and hidden video pausing plus removed-media cleanup to reduce unnecessary browser work.
- `project-status.json`, `next-steps.json`, and `PROJECT_STATUS.md` for machine-readable and human-readable progress tracking.
- `repository-checks.json` and `LOCAL_CHECKOUT.md` for active branch, base, PR, expected-ref, checkout, update, and handoff rules.
- `npm run status:check` for local branch, expected head, ahead/behind, base ancestry, clean-worktree, and project-record validation.
- `streamerbot/PRODUCTION_TTS_INTEGRATION.md` with a one-actor-first production wiring and cleanup runbook.
- `streamerbot/MULTI_ACTOR_TTS_TEST.md` with mapped-identity isolation, overlapping actor, stale-session, actor-scope, and unmapped-fallback checks.
- `streamerbot/actor-tts-mapping.example.json` as a documentation-only identity-to-actor worksheet containing no raw token values.

### Changed

- Secure LAN control pages receive actor management controls without modifying ordinary localhost control pages.
- Actor overlays replay their selected model after reconnecting.
- Held Type 2 emotes can be restored after a transient socket interruption while the LAN process remains running.
- Same-computer OBS and Streamer.bot setup uses the certificate-valid `https://localhost:3000` origin.
- Documentation now separates general setup, LAN setup, AI Actor management, Streamer.bot use, production TTS integration, multi-actor testing, project status, roadmap, and local checkout information.
- The first production TTS actor integration is complete; the end-to-end multi-actor isolation test is now the immediate roadmap item.
- Repository updates use `git pull --ff-only`, and work handoffs report the exact current remote head after all commits are complete.
- Fresh and updated verification checkouts use `npm ci` instead of `npm install` so dependencies come from the committed lockfile without an incidental lockfile rewrite.

### Fixed

- Actor emote media URLs with signed query parameters now retain a renderer-compatible extension hint, allowing WebM and other media to be detected correctly.
- Removed the global Express response monkey patch from actor control-panel injection and limited response transformation to the intended control-page routes.
- Added bounded startup and reconnection recovery so an overlay is less likely to remain blank after a temporary server interruption.
- Added documented recovery for a `package-lock.json` change caused by running `npm install` during clean-checkout verification.
- Documented direct blocking playback ownership so generated TTS files are not played simultaneously by both File Watcher and the production action.
- Documented how to identify and replace a stale Streamer.bot helper instance that performs unsupported capability-discovery requests.

### Validated

- Main and actor overlays rendered in a browser and OBS through `https://localhost:3000`.
- Actor expression, speaking, reset, Type 2 emote trigger, nested sub-animation, and release behavior passed live testing.
- The Streamer.bot helper compiled successfully and exposed all seven named methods.
- Streamer.bot expression, start, stop, reset, emote, sub-emote, release, cross-action session lookup, and stale-session protection passed live testing.
- The production `gnisu` identity completed `StartTts`, direct blocking Kokoro playback, and `StopTts`; its actor returned to idle after playback.
- The successful production cycle used the repository helper and did not use the stale capability-discovery path.
- Overlay recovery behavior passed the project harnesses and live observational testing.
- The repository status checker passed Node syntax validation, correctly detected an incidental `package-lock.json` change, and the owner authorized progression after reporting the expected branch, base, PR, and head values.
- GitHub reported no commit status contexts for the observed PR #8 head, so no CI pass is being claimed.

### Remaining before release promotion

- Map a second production identity and run the end-to-end multi-actor isolation, overlap, stale-session, actor-scope, and unmapped-fallback tests.
- Build the LAN-enabled Windows release package.
- Run a clean-folder package smoke test.
- Mark and merge draft pull requests only after explicit owner approval.
