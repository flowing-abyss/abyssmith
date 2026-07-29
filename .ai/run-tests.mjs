#!/usr/bin/env node
// Cross-platform test runner for .ai/ tooling: recursively finds
// `.ai/**/*.test.mjs` and hands the paths to Node's built-in test runner.
// Exists so package.json doesn't rely on shell command substitution
// (`$(find ...)`), which only works under a POSIX shell — this runs the
// same way on Windows, macOS, and Linux.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aiRoot = path.dirname(fileURLToPath(import.meta.url));
const testFiles = findTestFiles(aiRoot);

if (testFiles.length === 0) {
  console.error('run-tests: no .test.mjs files found under .ai/');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

function findTestFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findTestFiles(entryPath);
    }
    return entry.name.endsWith('.test.mjs') ? [entryPath] : [];
  });
}
