import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './is-main-module.mjs';

test('returns false when process.argv[1] is unset (e.g. imported, not run directly)', () => {
  const originalArgv1 = process.argv[1];
  process.argv[1] = '';
  try {
    assert.equal(isMainModule('file:///some/path.mjs'), false);
  } finally {
    process.argv[1] = originalArgv1;
  }
});

test('returns false when the URL does not match argv[1]', () => {
  const originalArgv1 = process.argv[1];
  process.argv[1] = '/some/other/script.mjs';
  try {
    assert.equal(isMainModule('file:///some/path.mjs'), false);
  } finally {
    process.argv[1] = originalArgv1;
  }
});

test('returns true when the URL resolves to the same path as argv[1]', () => {
  const originalArgv1 = process.argv[1];
  const thisFile = fileURLToPath(import.meta.url);
  process.argv[1] = thisFile;
  try {
    assert.equal(isMainModule(import.meta.url), true);
  } finally {
    process.argv[1] = originalArgv1;
  }
});

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) rmSync(dir, { force: true, recursive: true });
});

test('a real script using isMainModule runs its CLI body only when executed directly', () => {
  const dir = mktemp();
  const helperPath = path.join(dir, 'is-main-module.mjs');
  const scriptPath = path.join(dir, 'script.mjs');

  // Copy the real helper so the fixture script's relative import resolves.
  writeFileSync(
    helperPath,
    `export { isMainModule } from ${JSON.stringify(fileURLToPath(new URL('./is-main-module.mjs', import.meta.url)))};\n`,
  );
  writeFileSync(
    scriptPath,
    `
import { isMainModule } from './is-main-module.mjs';
if (isMainModule(import.meta.url)) {
  console.log('ran-as-cli');
}
`,
  );

  const result = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(result.trim(), 'ran-as-cli');
});

function mktemp() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'is-main-module-fixture-'));
  tmpDirs.push(dir);
  // os.tmpdir() can sit behind a symlink (e.g. macOS's /var -> /private/var);
  // resolve it so the path this test constructs matches what Node reports
  // via import.meta.url/fileURLToPath for a script run from here.
  return realpathSync(dir);
}
