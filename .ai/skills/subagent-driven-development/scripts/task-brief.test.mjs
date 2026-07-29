import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'task-brief');

let tmpDir;
let planPath;

before(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'task-brief-fixture-'));
  planPath = path.join(tmpDir, 'plan.md');
  writeFileSync(
    planPath,
    `# Fixture Implementation Plan

## Global Constraints

- Node version: 22+
- Package manager: pnpm only

---

### Task 1: First Component

**Required sources:**
- react.dev/reference/react/useActionState — used for the submit button

- [ ] **Step 1: Write the failing test**

### Task 2: Second Component

**Observability requirements:**
- vault reads get a Notice() on failure

- [ ] **Step 1: Do the thing**
`,
  );
});

after(() => {
  rmSync(tmpDir, { force: true, recursive: true });
});

function runTaskBrief(taskNumber, outFile) {
  execFileSync(scriptPath, [planPath, String(taskNumber), outFile], { encoding: 'utf8' });
  return readFileSync(outFile, 'utf8');
}

test('Task 1 brief contains Global Constraints and its own Required sources', () => {
  const out = path.join(tmpDir, 'task-1-brief.md');
  const content = runTaskBrief(1, out);
  assert.match(content, /Global Constraints/);
  assert.match(content, /Node version: 22\+/);
  assert.match(content, /Task 1: First Component/);
  assert.match(content, /Required sources/);
  assert.match(content, /useActionState/);
});

test('Task 1 brief does not contain Task 2 or its Observability section', () => {
  const out = path.join(tmpDir, 'task-1-brief-2.md');
  const content = runTaskBrief(1, out);
  assert.doesNotMatch(content, /Task 2: Second Component/);
  assert.doesNotMatch(content, /Observability requirements/);
  assert.doesNotMatch(content, /Notice\(\) on failure/);
});

test('Task 2 brief contains Global Constraints and its own Observability requirements', () => {
  const out = path.join(tmpDir, 'task-2-brief.md');
  const content = runTaskBrief(2, out);
  assert.match(content, /Global Constraints/);
  assert.match(content, /Node version: 22\+/);
  assert.match(content, /Task 2: Second Component/);
  assert.match(content, /Observability requirements/);
  assert.match(content, /Notice\(\) on failure/);
});

test('Task 2 brief does not contain Task 1 or its Required sources', () => {
  const out = path.join(tmpDir, 'task-2-brief-2.md');
  const content = runTaskBrief(2, out);
  assert.doesNotMatch(content, /Task 1: First Component/);
  assert.doesNotMatch(content, /Required sources/);
  assert.doesNotMatch(content, /useActionState/);
});
