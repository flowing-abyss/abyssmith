#!/usr/bin/env node
// Test-only stub for `pnpm`, used by verify-before-stop.test.mjs. Not part
// of the real tooling — invoked only via a fake `pnpm` shim on PATH that
// tests construct in a temp directory.
//
// PNPM_STUB_LOG: path to append one JSON line per invocation's argv.
// PNPM_STUB_VERIFY_EXIT: exit code to return for a ["run","verify"] call
//   (default 0). "--version" always succeeds.
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const logPath = process.env.PNPM_STUB_LOG;

if (logPath) {
  appendFileSync(logPath, `${JSON.stringify(args)}\n`);
}

if (args[0] === '--version') {
  console.log('9.0.0');
  process.exit(0);
}

if (args[0] === 'run' && args[1] === 'verify') {
  const exitCode = Number(process.env.PNPM_STUB_VERIFY_EXIT ?? '0');
  if (exitCode !== 0) {
    console.error('stub: verify failed');
  }
  process.exit(exitCode);
}

process.exit(0);
