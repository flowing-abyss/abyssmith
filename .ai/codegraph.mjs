#!/usr/bin/env node

// Runs this checkout's own CodeGraph — the lockfile-pinned
// `@colbymchenry/codegraph` devDependency that `pnpm install` puts in
// node_modules — with the given arguments. Every agent config goes through
// this file (MCP `serve --mcp`, the `prompt-hook` prompt hook) instead of a
// bare `codegraph` so no one depends on a global install, and each worktree
// runs the version its own lockfile names.
//
// Resolves the package from this file's own location, not the working
// directory: `node .ai/codegraph.mjs` works from the checkout root, and
// hooks pass an absolute path to it.
//
// Uses `process.execPath` + the package's `bin` script rather than
// `node_modules/.bin/codegraph`, which is a shell script on POSIX and a
// `.cmd` on Windows — neither spawns portably without a shell.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const entry = resolveCodegraphEntry();

if (!entry) {
  // A prompt hook must never break the prompt it runs for — no index tool
  // simply means no extra context, same as CodeGraph's own no-index path.
  if (args[0] === 'prompt-hook') {
    process.exit(0);
  }
  process.stderr.write(
    `CodeGraph is not installed in ${repoRoot} — run \`pnpm install\` there first.\n`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [entry, ...args], {
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    // CodeGraph's MCP server watches this pid and exits once it's gone. The
    // host that launched this wrapper is our parent, so hand that pid down
    // rather than letting the npm shim record this short-lived wrapper.
    CODEGRAPH_HOST_PPID: process.env.CODEGRAPH_HOST_PPID ?? String(process.ppid),
  },
});

if (result.error) {
  process.stderr.write(`codegraph: ${result.error.message}\n`);
}

// Exit 2 from a UserPromptSubmit hook blocks the prompt outright, so the
// prompt hook always reports success; everything else keeps its real status.
process.exit(args[0] === 'prompt-hook' ? 0 : (result.status ?? 1));

function resolveCodegraphEntry() {
  try {
    const require = createRequire(path.join(repoRoot, 'package.json'));
    const manifestPath = require.resolve('@colbymchenry/codegraph/package.json');
    const { bin } = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const binPath = typeof bin === 'string' ? bin : bin?.codegraph;
    return binPath ? path.join(path.dirname(manifestPath), binPath) : null;
  } catch {
    return null;
  }
}
