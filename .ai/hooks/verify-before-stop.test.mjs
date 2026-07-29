import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(hooksDir, 'verify-before-stop.mjs');
const stubPnpmPath = path.join(hooksDir, 'stub-pnpm.mjs');

const tmpDirs = [];

after(() => {
  for (const dir of tmpDirs) rmSync(dir, { force: true, recursive: true });
});

/** Builds a fixture project root (package.json + pnpm-lock.yaml) and a fake `pnpm` on PATH. */
function buildFixture() {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'verify-stop-fixture-'));
  tmpDirs.push(projectRoot);
  writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { verify: 'true' } }, null, 2),
  );
  writeFileSync(path.join(projectRoot, 'pnpm-lock.yaml'), '');
  mkdirSync(path.join(projectRoot, '.ai'), { recursive: true });

  const binDir = mkdtempSync(path.join(os.tmpdir(), 'verify-stop-bin-'));
  tmpDirs.push(binDir);
  const pnpmShimPath = path.join(binDir, 'pnpm');
  writeFileSync(pnpmShimPath, `#!/bin/sh\nexec node "${stubPnpmPath}" "$@"\n`);
  chmodSync(pnpmShimPath, 0o755);

  const logPath = path.join(projectRoot, 'pnpm-invocations.log');

  return { projectRoot, binDir, logPath };
}

function runHook(fixture, { verifyExit = 0 } = {}) {
  const result = spawnSync('node', [hookPath], {
    input: JSON.stringify({}),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.binDir}:${process.env.PATH}`,
      CLAUDE_PROJECT_DIR: fixture.projectRoot,
      PNPM_STUB_LOG: fixture.logPath,
      PNPM_STUB_VERIFY_EXIT: String(verifyExit),
    },
  });
  return result;
}

function readLog(fixture) {
  if (!existsSync(fixture.logPath)) return [];
  return readFileSync(fixture.logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const markerPath = (fixture) => path.join(fixture.projectRoot, '.ai', '.verify-on-stop');

let fixture;

beforeEach(() => {
  fixture = buildFixture();
});

test('marker absent: pnpm is never invoked, hook exits cleanly', () => {
  const result = runHook(fixture);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '{}');
  assert.deepEqual(readLog(fixture), []);
});

test('marker present: pnpm run verify is invoked exactly once, marker is deleted', () => {
  writeFileSync(markerPath(fixture), '');
  const result = runHook(fixture, { verifyExit: 0 });

  assert.equal(result.status, 0);
  const verifyInvocations = readLog(fixture).filter((a) => a[0] === 'run' && a[1] === 'verify');
  assert.equal(verifyInvocations.length, 1);
  assert.equal(existsSync(markerPath(fixture)), false);
});

test('verify failing: hook returns a blocking result, and the marker is still deleted', () => {
  writeFileSync(markerPath(fixture), '');
  const result = runHook(fixture, { verifyExit: 1 });

  assert.equal(result.status, 0); // the hook process itself exits 0; blocking is signaled via stdout JSON
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'block');
  assert.equal(existsSync(markerPath(fixture)), false);
});

test('a second stop after a completed run does not re-run verify (marker already consumed)', () => {
  writeFileSync(markerPath(fixture), '');
  runHook(fixture, { verifyExit: 0 });
  assert.equal(readLog(fixture).filter((a) => a[0] === 'run' && a[1] === 'verify').length, 1);

  // No marker was recreated — this is an ordinary subsequent stop.
  runHook(fixture, { verifyExit: 0 });
  assert.equal(
    readLog(fixture).filter((a) => a[0] === 'run' && a[1] === 'verify').length,
    1,
    'verify must not run again without a fresh marker',
  );
});
