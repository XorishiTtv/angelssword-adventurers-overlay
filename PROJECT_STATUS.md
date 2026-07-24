# Project status and roadmap

AS Adventurer keeps a small set of human-readable and machine-readable project records in the repository root:

- `project-status.json` records completed work, validation results, known limits, and the active development branch.
- `next-steps.json` records ordered work items, blockers, and acceptance criteria.
- `CHANGELOG.md` summarizes user-visible changes.
- Feature guides explain installation and operation in detail.

These files are documentation. They are not read by the overlay server and do not change runtime behavior.

## Current state

Phase 2 AI Actors is implemented on `agent/ai-actors-control-panel` in draft PR #8, targeting `agent/lan-mode`.

Completed and live-tested areas include:

- actor creation and management;
- actor expression and speaking control;
- Type 1 and Type 2 actor emotes;
- nested sub-animations;
- actor reset behavior;
- Streamer.bot helper compilation and all seven named methods;
- cross-action speech-session storage and stale-session protection;
- OBS rendering through the certificate-valid `https://localhost:3000` origin; and
- overlay reconnection and recovery behavior.

The remaining release gates are production TTS integration, an end-to-end multi-actor TTS test, the LAN-enabled Windows package build, and a clean-folder smoke test.

See `project-status.json` for the complete status record and `next-steps.json` for the ordered roadmap.

## Updating the JSON files

Use these rules whenever project work changes state:

1. Update `updated_at` in both JSON files.
2. Add completed functionality and validation evidence to `project-status.json`.
3. Move completed roadmap items out of the active queue or mark them `complete` in `next-steps.json`.
4. Add concise acceptance criteria before beginning a new roadmap item.
5. Add a user-visible summary to `CHANGELOG.md` when behavior, setup, security, packaging, or documentation changes.
6. Keep pull-request and branch state accurate.

Suggested roadmap status values are:

- `next` — the immediate recommended task;
- `planned` — accepted work that is not started;
- `in-progress` — active work;
- `blocked` — waiting on another item or approval;
- `complete` — finished and validated; and
- `deferred` — intentionally postponed.

## Security rules

Never place any of the following in status, roadmap, changelog, screenshots, or examples:

- machine tokens;
- actor tokens;
- complete authenticated OBS URLs;
- certificate private keys; or
- certificate password files.

Use placeholder actor IDs and redacted URLs in documentation. Treat Streamer.bot persisted globals and backups containing actor tokens as sensitive data.

## Documentation map

- `README.md` — general project overview and quick start.
- `LAN_SETUP.md` — secure LAN installation, machine registration, assets, OBS, certificates, backups, and release builds.
- `AI_ACTOR_CONTROL_PANEL.md` — actor creation, credentials, emotes, recovery, endpoints, and security.
- `STREAMERBOT_AI_ACTORS.md` — helper installation, arguments, TTS sessions, emotes, outputs, live-test checklist, and troubleshooting.
- `AI_ACTOR_MVP.md` — lower-level actor API and MVP design notes.
- `CHANGELOG.md` — user-visible changes grouped by development state.
