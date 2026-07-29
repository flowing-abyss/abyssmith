import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { runValidate } from './validate.mjs';

const CUSTOM_SKILLS = [
  'context-engineering',
  'source-driven-development',
  'risk-based-verification',
  'observability-and-instrumentation',
  'deprecation-and-migration',
  'releasing-an-obsidian-plugin',
];

const tmpDirs = [];

after(() => {
  for (const dir of tmpDirs) rmSync(dir, { force: true, recursive: true });
});

/** Builds a minimal, fully-passing .ai/ tree in a fresh temp directory and returns its path. */
function buildValidFixture() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'validate-fixture-'));
  tmpDirs.push(repoRoot);
  const aiRoot = path.join(repoRoot, '.ai');
  const skillsRoot = path.join(aiRoot, 'skills');
  const hooksRoot = path.join(aiRoot, 'hooks');
  const configsRoot = path.join(aiRoot, 'configs');

  for (const dir of ['using-superpowers', 'dispatching-parallel-agents', ...CUSTOM_SKILLS]) {
    mkdirSync(path.join(skillsRoot, dir), { recursive: true });
  }

  writeFileSync(
    path.join(skillsRoot, 'using-superpowers', 'SKILL.md'),
    `---\nname: using-superpowers\ndescription: test\n---\n\n${CUSTOM_SKILLS.map((n) => `\`${n}\``).join(', ')}\n`,
  );
  writeFileSync(
    path.join(skillsRoot, 'dispatching-parallel-agents', 'SKILL.md'),
    '---\nname: dispatching-parallel-agents\ndescription: test\n---\n\nDo not use for a shared working tree. Use subagent-driven-development instead.\n',
  );
  writeFileSync(
    path.join(skillsRoot, 'deprecation-and-migration', 'SKILL.md'),
    '---\nname: deprecation-and-migration\ndescription: test\n---\n\nHands off to brainstorming for design approval.\n',
  );
  mkdirSync(path.join(skillsRoot, 'brainstorming'), { recursive: true });
  writeFileSync(
    path.join(skillsRoot, 'brainstorming', 'spec-document-reviewer-prompt.md'),
    '# Spec Reviewer\n\n**Optional, manual, high-assurance step.**\n',
  );
  mkdirSync(path.join(skillsRoot, 'writing-plans'), { recursive: true });
  writeFileSync(
    path.join(skillsRoot, 'writing-plans', 'plan-document-reviewer-prompt.md'),
    '# Plan Reviewer\n\n**Optional, manual, high-assurance step.**\n',
  );

  mkdirSync(hooksRoot, { recursive: true });
  writeFileSync(path.join(hooksRoot, 'block-npm-commands.mjs'), '// stub\n');
  writeFileSync(path.join(hooksRoot, 'inject-superpowers.mjs'), '// stub\n');

  const manifest = {
    harnesses: {
      'claude-code': {
        configFile: '.ai/configs/.claude/settings.json',
        capabilities: {
          'session-bootstrap': 'inject-superpowers.mjs',
          'command-blocking': 'block-npm-commands.mjs',
        },
      },
    },
  };
  writeFileSync(
    path.join(hooksRoot, 'capability-manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  mkdirSync(path.join(configsRoot, '.claude'), { recursive: true });
  writeFileSync(
    path.join(configsRoot, '.claude', 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [{ hooks: [{ command: 'inject-superpowers.mjs' }] }],
          PreToolUse: [{ hooks: [{ command: 'block-npm-commands.mjs' }] }],
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ scripts: { verify: 'true' } }, null, 2),
  );

  return { repoRoot, aiRoot };
}

let fixture;

beforeEach(() => {
  fixture = buildValidFixture();
});

test('a minimal correct fixture tree produces zero errors', () => {
  const { errors } = runValidate(fixture.aiRoot);
  assert.deepEqual(errors, []);
});

test('a reference to a nonexistent skill produces an error', () => {
  const file = path.join(fixture.aiRoot, 'skills', 'dispatching-parallel-agents', 'SKILL.md');
  writeFileSync(file, 'See skill:this-skill-does-not-exist for details.\n', { flag: 'a' });
  const { errors } = runValidate(fixture.aiRoot);
  assert.ok(
    errors.some((e) => /references unknown skill "skill:this-skill-does-not-exist"/.test(e)),
    `expected an unknown-skill error, got: ${JSON.stringify(errors)}`,
  );
});

test('a harness missing its hook registration produces an error', () => {
  // Claude Code's settings.json exists but drops the command-blocking hook entirely.
  const settingsPath = path.join(fixture.aiRoot, 'configs', '.claude', 'settings.json');
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        hooks: {
          SessionStart: [{ hooks: [{ command: 'inject-superpowers.mjs' }] }],
        },
      },
      null,
      2,
    ),
  );
  const { errors } = runValidate(fixture.aiRoot);
  assert.ok(
    errors.some((e) => /claude-code: capability "command-blocking"/.test(e)),
    `expected a missing-capability-registration error, got: ${JSON.stringify(errors)}`,
  );
});

test('a missing canonical verify script produces an error', () => {
  writeFileSync(
    path.join(fixture.repoRoot, 'package.json'),
    JSON.stringify({ scripts: {} }, null, 2),
  );
  const { errors } = runValidate(fixture.aiRoot);
  assert.ok(
    errors.some((e) => /missing the canonical "verify" script/.test(e)),
    `expected a missing-verify-script error, got: ${JSON.stringify(errors)}`,
  );
});

test('an unconditional npm fallback in a pnpm-only instruction produces an error', () => {
  // A skill dir NOT on the npm-check exclusion list, with an unconditional npm command.
  const dir = path.join(fixture.aiRoot, 'skills', 'some-new-skill');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'SKILL.md'),
    '---\nname: some-new-skill\ndescription: test\n---\n\n```bash\nnpm install\n```\n',
  );
  const { errors } = runValidate(fixture.aiRoot);
  assert.ok(
    errors.some((e) => /executable npm\/npx command in a pnpm-only template/.test(e)),
    `expected an npm-fallback error, got: ${JSON.stringify(errors)}`,
  );
});

test('a missing referenced prompt link produces an error', () => {
  const file = path.join(fixture.aiRoot, 'skills', 'dispatching-parallel-agents', 'SKILL.md');
  writeFileSync(file, 'See [missing file](./does-not-exist.md) for details.\n', { flag: 'a' });
  const { errors } = runValidate(fixture.aiRoot);
  assert.ok(
    errors.some((e) => /link target does not exist: \.\/does-not-exist\.md/.test(e)),
    `expected a missing-link error, got: ${JSON.stringify(errors)}`,
  );
});
