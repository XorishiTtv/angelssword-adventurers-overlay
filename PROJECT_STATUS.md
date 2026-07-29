# Project status and roadmap

AS Adventurer keeps a small set of human-readable and machine-readable project records in the repository root:

- `project-status.json` records completed work, validation results, known limits, and the active development branch.
- `next-steps.json` records ordered work items, blockers, and acceptance criteria.
- `repository-checks.json` records the active branch, base, pull request, expected refs, local checks, and handoff rules.
- `LOCAL_CHECKOUT.md` explains fresh checkout, safe updates, expected-head verification, and troubleshooting.
- `CHANGELOG.md` summarizes user-visible changes.
- Feature guides explain installation and operation in detail.

These records do not affect overlay runtime behavior. `scripts/check-project-status.js` reads the JSON records and local Git metadata only when `npm run status:check` is run.

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
- OBS rendering through the certificate-valid `https://localhost:3000` origin;
- overlay reconnection and recovery behavior; and
- the local checkout and repository handoff workflow.

The immediate next step is production TTS integration. Use `streamerbot/PRODUCTION_TTS_INTEGRATION.md` and the non-secret `streamerbot/actor-tts-mapping.example.json` worksheet to connect one actor identity before expanding to the remaining actors.

After production TTS integration, the remaining gates are the multi-actor TTS test, the LAN-enabled Windows package build, and a clean-folder smoke test.

See `project-status.json` for the complete status record and `next-steps.json` for the ordered roadmap.

## Active checkout contract

The current repository contract is:

```text
Repository:     XorishiTtv/angelssword-adventurers-overlay
Working branch: agent/ai-actors-control-panel
Base branch:    agent/lan-mode
Pull request:   #8
Expected head:  origin/agent/ai-actors-control-panel
Expected base:  origin/agent/lan-mode
```

The exact head SHA changes whenever a commit is added. After `git fetch --prune origin`, the fetched remote-tracking ref is the source of truth. Local `HEAD` must equal `origin/agent/ai-actors-control-panel` after a successful update.

Run:

```powershell
npm run status:check
```

To fetch first:

```powershell
npm run status:check -- --fetch
```

The checker verifies:

- all project JSON files parse;
- their update dates agree;
- branch, base, and pull-request records agree;
- the current branch is correct;
- local and remote head SHAs match;
- ahead and behind are both zero;
- the expected base is an ancestor of `HEAD`;
- the worktree is clean; and
- exactly one roadmap item is marked `next`.

## GitHub status checks

At the time the repository-check workflow was added, PR #8 was open, draft, and mergeable, but GitHub reported no commit status contexts for its head.

“No reported checks” does not mean a CI suite passed. It means no GitHub commit statuses were configured or attached to the observed head. Local checks, harness results, and documented live tests remain the release evidence until CI is added.

With GitHub CLI installed:

```powershell
gh pr view 8 --repo XorishiTtv/angelssword-adventurers-overlay --json number,state,isDraft,mergeable,baseRefName,baseRefOid,headRefName,headRefOid,url
gh pr checks 8 --repo XorishiTtv/angelssword-adventurers-overlay
```

## Standard work handoff

Every handoff should include:

```text
Repository:
Working branch:
Base branch:
Pull request:
PR state:
Draft:
Mergeable:
Expected remote head SHA:
Expected base SHA:
GitHub status contexts:
Local status command:
Remaining next step:
```

Read the exact remote head after all commits for the handoff are complete. Do not reuse an older SHA from a previous message or document.

## Updating the JSON files

Use these rules whenever project work changes state:

1. Update `updated_at` in `project-status.json`, `next-steps.json`, and `repository-checks.json`.
2. Add completed functionality and validation evidence to `project-status.json`.
3. Move completed roadmap items out of the active queue or mark them `complete` in `next-steps.json`.
4. Keep exactly one immediate item marked `next`.
5. Add concise acceptance criteria before beginning a new roadmap item.
6. Update branch, base, PR, and expected refs in `repository-checks.json` when the active work changes.
7. Add a user-visible summary to `CHANGELOG.md` when behavior, setup, security, packaging, workflow, or documentation changes.
8. Run `npm run status:check` after fetching and before beginning the next work item.

Suggested roadmap status values are:

- `next` — the immediate recommended task;
- `planned` — accepted work that is not started;
- `in-progress` — active work;
- `blocked` — waiting on another item or approval;
- `complete` — finished and validated; and
- `deferred` — intentionally postponed.

## Security rules

Never place any of the following in status, roadmap, checkout, changelog, screenshots, or examples:

- machine tokens;
- actor tokens;
- complete authenticated OBS URLs;
- certificate private keys; or
- certificate password files.

Use placeholder actor IDs and redacted URLs in documentation. Treat Streamer.bot persisted globals and backups containing actor tokens as sensitive data.

## Documentation map

- `README.md` — general project overview and quick start.
- `LOCAL_CHECKOUT.md` — clone, update, expected-head verification, status checks, and troubleshooting.
- `repository-checks.json` — machine-readable repository and handoff policy.
- `LAN_SETUP.md` — secure LAN installation, machine registration, assets, OBS, certificates, backups, and release builds.
- `AI_ACTOR_CONTROL_PANEL.md` — actor creation, credentials, emotes, recovery, endpoints, and security.
- `STREAMERBOT_AI_ACTORS.md` — helper installation, arguments, TTS sessions, emotes, outputs, live-test checklist, and troubleshooting.
- `streamerbot/PRODUCTION_TTS_INTEGRATION.md` — one-actor-first production wiring, completion/error cleanup, fallback behavior, and acceptance checks.
- `streamerbot/actor-tts-mapping.example.json` — documentation-only identity-to-actor worksheet containing no raw token values.
- `AI_ACTOR_MVP.md` — lower-level actor API and MVP design notes.
- `CHANGELOG.md` — user-visible changes grouped by development state.
