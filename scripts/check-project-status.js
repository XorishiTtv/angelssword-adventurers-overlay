#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REMOTE = 'origin';
let failures = 0;

function printResult(ok, name, details) {
  const marker = ok ? 'PASS' : 'FAIL';
  console.log(`${marker} ${name}${details ? `: ${details}` : ''}`);
  if (!ok) failures += 1;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true
  });
}

function runGit(args) {
  const result = run('git', args);
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  };
}

function readJson(fileName) {
  const filePath = path.join(ROOT, fileName);
  try {
    return {
      ok: true,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8'))
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

function readAheadBehind(localRef, remoteRef) {
  const result = runGit(['rev-list', '--left-right', '--count', `${localRef}...${remoteRef}`]);
  if (!result.ok) return null;
  const parts = result.stdout.split(/\s+/).map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return { ahead: parts[0], behind: parts[1] };
}

if (process.argv.includes('--fetch')) {
  const fetchResult = runGit(['fetch', '--prune', REMOTE]);
  printResult(fetchResult.ok, 'fetch remote', fetchResult.ok ? REMOTE : fetchResult.stderr);
}

const projectStatus = readJson('project-status.json');
const nextSteps = readJson('next-steps.json');
const repositoryChecks = readJson('repository-checks.json');

printResult(projectStatus.ok, 'parse project-status.json', projectStatus.error || '');
printResult(nextSteps.ok, 'parse next-steps.json', nextSteps.error || '');
printResult(repositoryChecks.ok, 'parse repository-checks.json', repositoryChecks.error || '');

if (!projectStatus.ok || !nextSteps.ok || !repositoryChecks.ok) {
  process.exitCode = 1;
  return;
}

const status = projectStatus.value;
const roadmap = nextSteps.value;
const policy = repositoryChecks.value;
const expectedBranch = status.active_work && status.active_work.branch;
const expectedBase = status.active_work && status.active_work.base_branch;
const expectedPr = status.active_work && status.active_work.pull_request;
const remoteHeadRef = `${REMOTE}/${expectedBranch}`;
const remoteBaseRef = `${REMOTE}/${expectedBase}`;

printResult(
  status.updated_at === roadmap.updated_at && status.updated_at === policy.updated_at,
  'status dates agree',
  `${status.updated_at}, ${roadmap.updated_at}, ${policy.updated_at}`
);
printResult(
  policy.repository === status.repository,
  'repository names agree',
  policy.repository || 'missing repository'
);
printResult(
  policy.active_checkout &&
    policy.active_checkout.branch === expectedBranch &&
    policy.active_checkout.base_branch === expectedBase &&
    policy.active_checkout.pull_request === expectedPr,
  'checkout policy matches active work',
  `${expectedBranch} -> ${expectedBase}, PR #${expectedPr}`
);

const currentBranch = runGit(['branch', '--show-current']);
printResult(
  currentBranch.ok && currentBranch.stdout === expectedBranch,
  'working branch',
  currentBranch.ok ? currentBranch.stdout || '(detached HEAD)' : currentBranch.stderr
);

const localHead = runGit(['rev-parse', 'HEAD']);
const remoteHead = runGit(['rev-parse', '--verify', remoteHeadRef]);
const remoteBase = runGit(['rev-parse', '--verify', remoteBaseRef]);

printResult(localHead.ok, 'read local HEAD', localHead.ok ? localHead.stdout : localHead.stderr);
printResult(remoteHead.ok, 'read expected remote head', remoteHead.ok ? remoteHead.stdout : remoteHead.stderr);
printResult(remoteBase.ok, 'read expected base head', remoteBase.ok ? remoteBase.stdout : remoteBase.stderr);

if (localHead.ok && remoteHead.ok) {
  printResult(
    localHead.stdout === remoteHead.stdout,
    'local HEAD matches expected remote head',
    `local=${localHead.stdout} remote=${remoteHead.stdout}`
  );

  const counts = readAheadBehind('HEAD', remoteHeadRef);
  printResult(
    counts !== null && counts.ahead === 0 && counts.behind === 0,
    'ahead/behind',
    counts ? `ahead=${counts.ahead} behind=${counts.behind}` : 'unable to calculate'
  );
}

const worktree = runGit(['status', '--porcelain']);
printResult(
  worktree.ok && worktree.stdout.length === 0,
  'clean worktree',
  worktree.ok ? (worktree.stdout || 'clean') : worktree.stderr
);

if (remoteBase.ok) {
  const ancestry = runGit(['merge-base', '--is-ancestor', remoteBaseRef, 'HEAD']);
  printResult(
    ancestry.ok,
    'base branch is an ancestor',
    ancestry.ok ? `${remoteBaseRef} -> HEAD` : `exit=${ancestry.status}`
  );
}

const nextItems = Array.isArray(roadmap.items)
  ? roadmap.items.filter(item => item && item.status === 'next')
  : [];
printResult(
  nextItems.length === 1,
  'exactly one next roadmap item',
  nextItems.length === 1 ? `${nextItems[0].id}: ${nextItems[0].title}` : `found ${nextItems.length}`
);

console.log('');
console.log(`Expected branch: ${expectedBranch}`);
console.log(`Expected base:   ${expectedBase}`);
console.log(`Expected PR:     #${expectedPr}`);
console.log(`Expected head:   ${remoteHead.ok ? remoteHead.stdout : 'unavailable; run git fetch --prune origin'}`);
console.log(`GitHub checks:   ${policy.github_snapshot.reported_commit_status_contexts} reported in the recorded snapshot`);
console.log('');

if (failures > 0) {
  console.error(`${failures} repository status check(s) failed.`);
  console.error('See LOCAL_CHECKOUT.md for safe update and recovery steps.');
  process.exitCode = 1;
} else {
  console.log('All repository status checks passed.');
}
