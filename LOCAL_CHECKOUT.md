# Local checkout and repository status checks

This guide defines the repeatable checkout, update, and handoff process for the active AS Adventurer work.

## Current active work

- Repository: `XorishiTtv/angelssword-adventurers-overlay`
- Working branch: `agent/ai-actors-control-panel`
- Base branch: `agent/lan-mode`
- Pull request: `#8`
- Expected remote head: `origin/agent/ai-actors-control-panel`
- Expected remote base: `origin/agent/lan-mode`

The exact head SHA changes every time a commit is added. After fetching, the remote-tracking ref is the source of truth. A valid updated checkout has the same SHA for `HEAD` and `origin/agent/ai-actors-control-panel`.

## Fresh checkout

```powershell
git clone https://github.com/XorishiTtv/angelssword-adventurers-overlay.git
cd angelssword-adventurers-overlay
git fetch --prune origin
git switch --track -c agent/ai-actors-control-panel origin/agent/ai-actors-control-panel
npm install
npm run status:check
```

Expected result:

- the current branch is `agent/ai-actors-control-panel`;
- the local and remote head SHAs match;
- ahead and behind are both zero;
- `origin/agent/lan-mode` is an ancestor of `HEAD`;
- the worktree is clean; and
- the three project JSON files parse and agree on branch, PR, and update date.

## Update an existing checkout

First inspect local work:

```powershell
git status --short
git branch --show-current
```

Do not pull over uncommitted work. Commit it, stash it, or intentionally discard it after making a backup.

Then update with a fast-forward-only pull:

```powershell
git fetch --prune origin
git switch agent/ai-actors-control-panel
git pull --ff-only origin agent/ai-actors-control-panel
npm install
npm run status:check
```

`--ff-only` prevents Git from silently creating a merge commit during an ordinary update.

To fetch and check in one command after the branch is selected:

```powershell
npm run status:check -- --fetch
```

## Verify the expected head manually

```powershell
git rev-parse HEAD
git rev-parse origin/agent/ai-actors-control-panel
git rev-list --left-right --count HEAD...origin/agent/ai-actors-control-panel
```

Expected output:

- both `rev-parse` commands print the same SHA;
- the ahead/behind command prints `0 0`.

Verify the base relationship:

```powershell
git merge-base --is-ancestor origin/agent/lan-mode HEAD
$LASTEXITCODE
```

Expected exit code: `0`.

Verify the worktree:

```powershell
git status --short
```

Expected output: no lines.

## Check the pull request and GitHub status contexts

With GitHub CLI installed and authenticated:

```powershell
gh pr view 8 --repo XorishiTtv/angelssword-adventurers-overlay --json number,state,isDraft,mergeable,baseRefName,baseRefOid,headRefName,headRefOid,url
gh pr checks 8 --repo XorishiTtv/angelssword-adventurers-overlay
```

At the time this workflow was added, PR #8 was open, draft, mergeable, and GitHub reported no commit status contexts. A message indicating that no checks are reported is therefore not the same as a passing CI suite; it means no GitHub commit checks are currently configured or attached to that head.

Local validation and the live-test records in `project-status.json` remain required until repository CI is added.

## Standard handoff status

Every work handoff should report:

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

The exact expected head SHA must be read after all commits for the handoff are complete. Do not copy an older SHA from documentation.

## Status files

- `project-status.json` records completed work, validation, known limits, and active work.
- `next-steps.json` records ordered work, blockers, and acceptance criteria.
- `repository-checks.json` records branch, base, PR, expected refs, commands, and check rules.
- `npm run status:check` validates the local repository against those records.

Whenever active branch, base branch, pull request, or project date changes, update all affected status files together.

## Troubleshooting

### Local changes are present

Inspect them before updating:

```powershell
git status
git diff
git diff --staged
```

Commit or stash intentional work. Avoid `git reset --hard` unless the changes are backed up and destructive removal is deliberate.

### Local and remote heads differ

```powershell
git fetch --prune origin
git log --oneline --decorate --graph --max-count=20 --all
git rev-list --left-right --count HEAD...origin/agent/ai-actors-control-panel
```

A nonzero left value means the local branch has commits not on the remote. A nonzero right value means the local branch is behind. Do not force-push or reset until the commits are understood.

### The local branch does not exist

```powershell
git fetch --prune origin
git switch --track -c agent/ai-actors-control-panel origin/agent/ai-actors-control-panel
```

### The remote is wrong

```powershell
git remote -v
```

The `origin` fetch URL should point to `XorishiTtv/angelssword-adventurers-overlay`.
