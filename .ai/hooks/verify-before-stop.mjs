#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Runs the full `pnpm verify` gate before the agent finishes its turn — but
// only when the agent itself has signaled it's about to claim the branch or
// task is complete, not on every ordinary conversational stop.
//
// No harness this hooks into (Claude Code, Codex, OpenCode, Pi) exposes a
// reliable "the agent is claiming completion, not just pausing" signal on
// its Stop/idle/settle event — that event fires after every turn, including
// brainstorming questions, requests for design approval, BLOCKED reports,
// and ordinary mid-task turns. Running the full gate unconditionally on all
// of those would be both slow and wrong (it can't distinguish them).
//
// Instead this uses an explicit completion marker: `finishing-a-development-
// branch` (and anything that defers to it) creates `.ai/.verify-on-stop`
// as its last action before presenting the "implementation complete" menu.
// This hook only runs the gate when that marker exists, and always deletes
// it immediately so a stale marker can't silently re-trigger the gate on a
// later, unrelated stop.
//
// Per-harness blocking classification for this output's {decision:"block"}
// (see .ai/hooks/capability-manifest.json and each adapter's own comment):
// - Claude Code, Codex: CONFIRMED blocking — {decision:"block", reason} is
//   the harness's own documented Stop-hook contract and actually halts the
//   turn (observed directly: this repo's own development used it to catch
//   a real verify failure at Stop time).
// - OpenCode, Pi: their adapters only pass this result to `console.error`
//   on the idle/settled event — NOTIFICATION-ONLY on those two, not a
//   verified block. In all four cases, the primary completion guarantee is
//   `finishing-a-development-branch` running `pnpm run verify` directly,
//   before ever touching this marker — this hook is a backstop, weaker on
//   OpenCode/Pi than on Claude Code/Codex, never the only line of defense.
const input = await readStdinJson();

// Avoid an infinite Stop-hook continuation loop.
if (input.stop_hook_active === true) {
  process.stdout.write('{}');
  process.exit(0);
}

const projectRoot = resolveProjectRoot();
const markerPath = path.join(projectRoot, '.ai', '.verify-on-stop');

if (!existsSync(markerPath)) {
  process.stdout.write('{}');
  process.exit(0);
}

rmSync(markerPath, { force: true });

const packageJsonPath = path.join(projectRoot, 'package.json');
const lockfilePath = path.join(projectRoot, 'pnpm-lock.yaml');

// A plain Obsidian vault may not be a Node.js project, so there is nothing to verify.
if (!existsSync(packageJsonPath)) {
  process.stdout.write('{}');
  process.exit(0);
}

if (!existsSync(lockfilePath)) {
  blockStop(
    'package.json exists, but pnpm-lock.yaml is missing. Initialize or install the project with pnpm.',
  );
}

const pnpmVersion = spawnSync('pnpm', ['--version'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: process.env,
});

if (pnpmVersion.error || pnpmVersion.status !== 0) {
  blockStop('pnpm is required for this project but is not available in PATH.');
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

// `verify` is the single canonical quality gate — the same one CI, pre-push,
// and the release flow run. This hook never maintains its own separate list
// of checks; a list here would drift from `verify` and silently under-check.
if (!packageJson.scripts?.verify) {
  process.stdout.write('{}');
  process.exit(0);
}

const result = spawnSync('pnpm', ['run', 'verify'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: process.env,
});

if (result.error) {
  blockStop(`Unable to run pnpm: ${result.error.message}`);
}

if (result.status !== 0) {
  blockStop(formatFailure('pnpm run verify', result));
}

process.stdout.write('{}');

async function readStdinJson() {
  let raw = '';

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    // Continue with an empty payload if the hook input cannot be parsed.
    return {};
  }
}

function resolveProjectRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  const gitRoot = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return gitRoot.status === 0 ? gitRoot.stdout.trim() : process.cwd();
}

function formatFailure(command, result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  const tail = output.split('\n').slice(-40).join('\n');

  return `${command} failed.${tail ? `\n\n${tail}` : ''}`;
}

function blockStop(reason) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason,
    }),
  );
  process.exit(0);
}
