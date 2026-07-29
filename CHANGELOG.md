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

### Changed

- Secure LAN control pages receive actor management controls without modifying ordinary localhost control pages.
- Actor overlays replay their selected model after reconnecting.
- Held Type 2 emotes can be restored after a transient socket interruption while the LAN process remains running.
- Same-computer OBS and Streamer.bot setup uses the certificate-valid `https://localhost:3000` origin.
- Documentation now separates general setup, LAN setup, AI Actor management, Streamer.bot use, project status, roadmap, and local checkout information.
- The immediate roadmap checkpoint is now a verified local checkout before production TTS integration begins.
- Repository updates use `git pull --ff-only`, and work handoffs report the exact current remote head after all commits are complete.

### Fixed

- Actor emote media URLs with signed query parameters now retain a renderer-compatible extension hint, allowing WebM and other media to be detected correctly.
- Removed the global Express response monkey patch from actor control-panel injection and limited response transformation to the intended control-page routes.
- Added bounded startup and reconnection recovery so an overlay is less likely to remain blank after a temporary server interruption.

### Validated

- Main and actor overlays rendered in a browser and OBS through `https://localhost:3000`.
- Actor expression, speaking, reset, Type 2 emote trigger, nested sub-animation, and release behavior passed live testing.
- The Streamer.bot helper compiled successfully and exposed all seven named methods.
- Streamer.bot expression, start, stop, reset, emote, sub-emote, release, cross-action session lookup, and stale-session protection passed live testing.
- Overlay recovery behavior passed the project harnesses and live observational testing.
- The repository status checker passed Node syntax validation; execution against the updated local checkout is the next checkpoint.
- GitHub reported no commit status contexts for the observed PR #8 head, so no CI pass is being claimed.

### Remaining before release promotion

- Update the local checkout and run `npm run status:check`.
- Connect the helper to the production TTS workflow and run an end-to-end multi-actor test.
- Build the LAN-enabled Windows release package.
- Run a clean-folder package smoke test.
- Mark and merge draft pull requests only after explicit owner approval.
