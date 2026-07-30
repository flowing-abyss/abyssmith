#!/usr/bin/env node
// Package-manager detection for using-git-worktrees' Project Setup step.
//
// Policy: package.json's "packageManager" field is the authoritative
// signal when present. If it disagrees with a lockfile that's present for
// a *different* manager, that's a conflict — report it and refuse to pick
// a manager, rather than silently trusting one signal over the other (a
// stale packageManager field, or a leftover lockfile from a prior manager,
// are both real and cheap mistakes to make). Never fall back to npm as a
// silent default: an unresolved signal is "unknown", not "npm".
//
// `detectPackageManager` is a pure function (no fs access) so it can be
// unit tested directly against synthetic inputs; the CLI below is a thin
// wrapper that reads the real filesystem.


export const MANAGERS = ['pnpm', 'yarn', 'npm'];

export const LOCKFILE_MANAGER = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
};

/**
 * @param {{ packageManager?: string | undefined, lockfiles: string[] }} input
 *   `packageManager` is package.json's raw "packageManager" field value
 *   (e.g. "pnpm@9.1.0"), if any. `lockfiles` is the list of lockfile
 *   basenames found in the project directory (any of LOCKFILE_MANAGER's keys).
 * @returns {{ status: 'ok' | 'conflict' | 'unknown', manager: string | null, reason: string }}
 */
export function detectPackageManager({ packageManager, lockfiles }) {
  const declared = parsePackageManagerField(packageManager);
  const lockManagers = [...new Set(lockfiles.map((f) => LOCKFILE_MANAGER[f]).filter(Boolean))];

  if (declared && lockManagers.length > 0 && !lockManagers.includes(declared)) {
    return {
      status: 'conflict',
      manager: null,
      reason: `package.json declares packageManager "${declared}" but found a lockfile for: ${lockManagers.join(', ')}. Resolve the conflict (update packageManager or remove the stale lockfile) before installing.`,
    };
  }

  if (declared) {
    return { status: 'ok', manager: declared, reason: 'packageManager field' };
  }

  if (lockManagers.length === 1) {
    return { status: 'ok', manager: lockManagers[0], reason: 'lockfile' };
  }

  if (lockManagers.length > 1) {
    return {
      status: 'conflict',
      manager: null,
      reason: `multiple lockfiles present for different managers: ${lockManagers.join(', ')}. Resolve before installing.`,
    };
  }

  return {
    status: 'unknown',
    manager: null,
    reason: 'no packageManager field and no recognized lockfile — check project instructions (AGENTS.md/CLAUDE.md), or ask which package manager to use',
  };
}

function parsePackageManagerField(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const name = value.split('@')[0].trim();
  return MANAGERS.includes(name) ? name : null;
}

// --- CLI ---
// Usage: detect-package-manager.mjs [dir]
// Prints the detected manager name to stdout and exits 0 on success.
// On "conflict" or "unknown", prints the reason to stderr and exits
// non-zero — callers must not fall back to npm on a non-zero exit.
if (import.meta.main) {
  const { existsSync, readFileSync } = await import('node:fs');
  const path = await import('node:path');

  const dir = process.argv[2] ?? process.cwd();
  const packageJsonPath = path.join(dir, 'package.json');
  const packageManager = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, 'utf8')).packageManager
    : undefined;
  const lockfiles = Object.keys(LOCKFILE_MANAGER).filter((f) => existsSync(path.join(dir, f)));

  const result = detectPackageManager({ packageManager, lockfiles });

  if (result.status === 'ok') {
    console.log(result.manager);
    process.exit(0);
  }

  console.error(`${result.status}: ${result.reason}`);
  process.exit(result.status === 'conflict' ? 2 : 1);
}
