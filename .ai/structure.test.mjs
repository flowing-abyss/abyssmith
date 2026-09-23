// Structural tests for the .ai/ tree — plain tests against this repo's own
// real tree, not a separate validation framework and not synthetic
// fixtures. Checks objective, mechanically-verifiable properties only:
// broken links, dangling formal skill references, and the specific hook
// registrations this template actually depends on. It does not check
// Markdown prose, workflow explanations, or hardcoded skill lists — those
// turn tests into a second specification and drift from the real docs.

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aiRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(aiRoot, '..');
const skillsRoot = path.join(aiRoot, 'skills');
const hooksRoot = path.join(aiRoot, 'hooks');
const configsRoot = path.join(aiRoot, 'configs');
const codegraphLauncher = path.join(aiRoot, 'codegraph.mjs');

// Keep test runs out of CodeGraph's anonymous usage telemetry.
process.env.DO_NOT_TRACK = '1';

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

const markdownFiles = listFiles(skillsRoot).filter((f) => f.endsWith('.md'));
const skillDirs = new Set(
  readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name),
);

test('relative Markdown links in skills resolve to existing files', () => {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  const problems = [];

  for (const file of markdownFiles) {
    // writing-skills is vendored upstream meta-documentation about how to
    // write skills; its links are illustrative filenames for a
    // hypothetical skill package, not real navigation targets here.
    if (path.relative(skillsRoot, file).startsWith(`writing-skills${path.sep}`)) continue;

    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(linkPattern)) {
      const target = match[1].split('#')[0].trim();
      if (!target || /^([a-z]+:)?\/\//i.test(target) || target.startsWith('mailto:')) continue;
      const resolved = path.resolve(path.dirname(file), target);
      if (!existsSync(resolved)) {
        problems.push(`${path.relative(repoRoot, file)}: ${target}`);
      }
    }
  }

  assert.deepEqual(problems, []);
});

test('formal skill:<name> and superpowers:<name> references point to existing skill directories', () => {
  const pattern = /\b(?:superpowers|skill):([a-z][a-z0-9-]*)/g;
  const problems = [];

  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(pattern)) {
      if (!skillDirs.has(match[1])) {
        problems.push(`${path.relative(repoRoot, file)}: ${match[0]}`);
      }
    }
  }

  assert.deepEqual(problems, []);
});

test('inject-superpowers.mjs is registered in the Claude Code and Codex configs', () => {
  const claude = readFileSync(path.join(configsRoot, '.claude', 'settings.json'), 'utf8');
  const codex = readFileSync(path.join(configsRoot, '.codex', 'hooks.json'), 'utf8');
  assert.match(claude, /inject-superpowers\.mjs/);
  assert.match(codex, /inject-superpowers\.mjs/);
});

// --- CodeGraph ---

test('CodeGraph MCP is enabled for every MCP-capable harness through the project launcher', () => {
  const launcherArgs = ['.ai/codegraph.mjs', 'serve', '--mcp'];
  const claude = JSON.parse(readFileSync(path.join(configsRoot, '.mcp.json'), 'utf8'));
  const claudeSettings = JSON.parse(
    readFileSync(path.join(configsRoot, '.claude', 'settings.json'), 'utf8'),
  );
  const codex = readFileSync(path.join(configsRoot, '.codex', 'config.toml'), 'utf8');
  const opencode = JSON.parse(readFileSync(path.join(configsRoot, 'opencode.json'), 'utf8'));
  const pi = JSON.parse(readFileSync(path.join(configsRoot, '.pi', 'mcp.json'), 'utf8'));

  assert.deepEqual(claude.mcpServers?.codegraph, {
    type: 'stdio',
    command: 'node',
    args: launcherArgs,
    alwaysLoad: true,
  });
  // Claude Code ignores MCP approval in the shared settings; setup-codegraph
  // writes it to .claude/settings.local.json instead (tested below).
  assert.equal(claudeSettings.enabledMcpjsonServers, undefined);
  assert.ok(claudeSettings.permissions?.allow?.includes('mcp__codegraph__*'));

  const codexTable = codex.match(/^\[mcp_servers\.codegraph\]\n((?:(?!\[).*\n)*)/m)?.[1];
  assert.ok(codexTable, 'missing [mcp_servers.codegraph] in .codex/config.toml');
  assert.match(codexTable, /^command = "node"$/m);
  assert.match(codexTable, /^args = \["\.ai\/codegraph\.mjs", "serve", "--mcp"\]$/m);
  assert.doesNotMatch(codexTable, /enabled = false/);

  assert.deepEqual(opencode.mcp?.codegraph, {
    type: 'local',
    command: ['node', ...launcherArgs],
    enabled: true,
  });

  // pi-mcp-adapter picks the server itself up from .mcp.json; the Pi-owned
  // override only lists codegraph_explore as a direct tool.
  assert.deepEqual(pi.mcpServers?.codegraph, { directTools: true, toolPrefix: 'none' });

  for (const config of [JSON.stringify(claude), codex, JSON.stringify(opencode)]) {
    assert.doesNotMatch(config, /serena/i);
  }
});

test('the CodeGraph prompt hook is registered in all four harness configs', () => {
  const claude = JSON.parse(
    readFileSync(path.join(configsRoot, '.claude', 'settings.json'), 'utf8'),
  );
  const codex = JSON.parse(readFileSync(path.join(configsRoot, '.codex', 'hooks.json'), 'utf8'));
  const promptHookCommands = (config) =>
    (config.hooks?.UserPromptSubmit ?? [])
      .flatMap((entry) => entry.hooks ?? [])
      .map((hook) => hook.command);

  assert.ok(
    promptHookCommands(claude).includes('node "$CLAUDE_PROJECT_DIR/.ai/codegraph.mjs" prompt-hook'),
  );
  assert.ok(
    promptHookCommands(codex).includes(
      'node "$(git rev-parse --show-toplevel)/.ai/codegraph.mjs" prompt-hook',
    ),
  );
  for (const adapter of [
    path.join(configsRoot, '.opencode', 'plugins', 'codegraph.js'),
    path.join(configsRoot, '.pi', 'extensions', 'codegraph.ts'),
  ]) {
    assert.match(readFileSync(adapter, 'utf8'), /'codegraph\.mjs'\)[\s\S]*'prompt-hook'/, adapter);
  }
});

test('the CodeGraph launcher runs the lockfile-pinned devDependency', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const pinned = packageJson.devDependencies?.['@colbymchenry/codegraph'];
  assert.match(pinned ?? '', /^\d+\.\d+\.\d+$/, 'codegraph must be pinned to an exact version');

  const result = spawnSync(process.execPath, [codegraphLauncher, '--version'], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), pinned);
});

describe('without an installed CodeGraph package', () => {
  let checkout;

  before(() => {
    // A bare copy of the .ai scripts with no node_modules next to it.
    checkout = mkdtempSync(path.join(tmpdir(), 'codegraph-missing-'));
    mkdirSync(path.join(checkout, '.ai'), { recursive: true });
    copyFileSync(codegraphLauncher, path.join(checkout, '.ai', 'codegraph.mjs'));
    copyFileSync(
      path.join(aiRoot, 'setup-codegraph.mjs'),
      path.join(checkout, '.ai', 'setup-codegraph.mjs'),
    );
    writeFileSync(path.join(checkout, 'package.json'), '{}\n');
  });

  after(() => rmSync(checkout, { recursive: true, force: true }));

  const run = (script, args, env = {}) =>
    spawnSync(process.execPath, [path.join(checkout, '.ai', script), ...args], {
      cwd: checkout,
      input: '{"prompt":"How does greet work?"}',
      encoding: 'utf8',
      env: { ...process.env, CI: '', ...env },
    });

  test('the prompt hook stays silent and succeeds, so it never blocks a prompt', () => {
    const result = run('codegraph.mjs', ['prompt-hook']);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  });

  test('other commands fail and point at pnpm install', () => {
    const result = run('codegraph.mjs', ['serve', '--mcp']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pnpm install/);
  });

  test('setup warns but never fails the install', () => {
    const result = run('setup-codegraph.mjs', []);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /setup failed/);
    assert.equal(existsSync(path.join(checkout, '.codegraph')), false);
  });

  test('setup is skipped in CI', () => {
    rmSync(path.join(checkout, '.claude'), { recursive: true, force: true });
    const result = run('setup-codegraph.mjs', [], { CI: 'true' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /skipped in CI/);
    assert.equal(existsSync(path.join(checkout, '.claude')), false);
  });

  describe('Claude Code MCP approval', () => {
    const localSettings = () => path.join(checkout, '.claude', 'settings.local.json');
    const writeLocalSettings = (settings) => {
      mkdirSync(path.dirname(localSettings()), { recursive: true });
      writeFileSync(localSettings(), JSON.stringify(settings));
    };
    const readLocalSettings = () => JSON.parse(readFileSync(localSettings(), 'utf8'));

    test('setup approves codegraph in a fresh local settings file', () => {
      rmSync(path.join(checkout, '.claude'), { recursive: true, force: true });
      assert.equal(run('setup-codegraph.mjs', []).status, 0);
      assert.deepEqual(readLocalSettings(), { enabledMcpjsonServers: ['codegraph'] });
    });

    test('setup keeps existing local settings and never duplicates the approval', () => {
      writeLocalSettings({
        permissions: { allow: ['Bash(pnpm test)'] },
        enabledMcpjsonServers: ['context7'],
      });
      assert.equal(run('setup-codegraph.mjs', []).status, 0);
      assert.equal(run('setup-codegraph.mjs', []).status, 0);
      assert.deepEqual(readLocalSettings(), {
        permissions: { allow: ['Bash(pnpm test)'] },
        enabledMcpjsonServers: ['context7', 'codegraph'],
      });
    });

    test('setup leaves an explicit rejection alone', () => {
      writeLocalSettings({ disabledMcpjsonServers: ['codegraph'] });
      assert.equal(run('setup-codegraph.mjs', []).status, 0);
      assert.deepEqual(readLocalSettings(), { disabledMcpjsonServers: ['codegraph'] });
    });

    test('setup does not overwrite an unreadable local settings file', () => {
      mkdirSync(path.dirname(localSettings()), { recursive: true });
      writeFileSync(localSettings(), '{ not json');
      const result = run('setup-codegraph.mjs', []);
      assert.equal(result.status, 0);
      assert.match(result.stderr, /approve the codegraph MCP server when Claude Code asks/);
      assert.equal(readFileSync(localSettings(), 'utf8'), '{ not json');
    });
  });
});

describe('the OpenCode and Pi prompt-hook adapters', () => {
  const structuralPrompt = 'How does greet call formatGreeting?';
  let project;

  before(() => {
    project = mkdtempSync(path.join(tmpdir(), 'codegraph-adapters-'));
    mkdirSync(path.join(project, 'src'));
    writeFileSync(
      path.join(project, 'src', 'greeter.ts'),
      [
        'export function greet(name: string): string {',
        '  return formatGreeting(name);',
        '}',
        '',
        'function formatGreeting(name: string): string {',
        '  return `Hello, ${name}`;',
        '}',
        '',
      ].join('\n'),
    );
    const init = spawnSync(process.execPath, [codegraphLauncher, 'init', '--yes', project], {
      encoding: 'utf8',
    });
    assert.equal(init.status, 0, init.stderr);
  });

  after(() => rmSync(project, { recursive: true, force: true }));

  test('OpenCode attaches the context as a synthetic part with a new ascending part id', async () => {
    const pluginUrl = pathToFileURL(path.join(configsRoot, '.opencode', 'plugins', 'codegraph.js'));
    const { CodegraphPromptContext } = await import(pluginUrl.href);
    const hooks = await CodegraphPromptContext({ directory: project });
    const userPart = {
      id: 'prt_000000000000userpart000000',
      sessionID: 'ses_1',
      messageID: 'msg_1',
      type: 'text',
      text: structuralPrompt,
    };
    const output = { message: { id: 'msg_1', sessionID: 'ses_1' }, parts: [userPart] };

    await hooks['chat.message']({ sessionID: 'ses_1' }, output);

    assert.equal(output.parts.length, 2);
    const [, added] = output.parts;
    assert.equal(added.type, 'text');
    assert.equal(added.synthetic, true);
    assert.equal(added.sessionID, 'ses_1');
    assert.equal(added.messageID, 'msg_1');
    assert.match(added.id, /^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    assert.ok(added.id > userPart.id);
    assert.match(added.text, /<codegraph_context[\s\S]*formatGreeting/);
  });

  test('Pi injects the context as a hidden message before the agent starts', async () => {
    let handler;
    const extensionUrl = pathToFileURL(path.join(configsRoot, '.pi', 'extensions', 'codegraph.ts'));
    const { default: register } = await import(extensionUrl.href);
    register({ on: (event, fn) => event === 'before_agent_start' && (handler = fn) });

    const result = await handler({ prompt: structuralPrompt }, { cwd: project });

    assert.equal(result?.message?.customType, 'codegraph');
    assert.equal(result.message.display, false);
    assert.match(result.message.content, /<codegraph_context[\s\S]*formatGreeting/);
  });

  test('both adapters add nothing for a prompt with no structural question', async () => {
    const pluginUrl = pathToFileURL(path.join(configsRoot, '.opencode', 'plugins', 'codegraph.js'));
    const { CodegraphPromptContext } = await import(pluginUrl.href);
    const hooks = await CodegraphPromptContext({ directory: project });
    const output = {
      message: { id: 'msg_1', sessionID: 'ses_1' },
      parts: [{ type: 'text', text: 'fix the typo in the readme' }],
    };
    await hooks['chat.message']({ sessionID: 'ses_1' }, output);
    assert.equal(output.parts.length, 1);

    let handler;
    const extensionUrl = pathToFileURL(path.join(configsRoot, '.pi', 'extensions', 'codegraph.ts'));
    const { default: register } = await import(extensionUrl.href);
    register({ on: (_event, fn) => (handler = fn) });
    assert.equal(
      await handler({ prompt: 'fix the typo in the readme' }, { cwd: project }),
      undefined,
    );
  });
});

describe('OpenCode and Pi adapters loaded from their mirrored path', () => {
  // Pi reports the symlink's own path in import.meta.url, and Windows mirrors
  // files as hard links, so an adapter must find `.ai` from `.pi/extensions/`
  // or `.opencode/plugins/` too — not only from `.ai/configs/`.
  const adapters = [
    '.opencode/plugins/codegraph.js',
    '.opencode/plugins/pnpm-policy.js',
    '.pi/extensions/codegraph.ts',
    '.pi/extensions/pnpm-policy.ts',
  ];
  const stubContext = '<codegraph_context>mirror</codegraph_context>';
  let checkout;

  before(() => {
    checkout = mkdtempSync(path.join(tmpdir(), 'adapter-mirror-'));
    writeFileSync(path.join(checkout, 'package.json'), '{ "type": "module" }\n');
    for (const adapter of adapters) {
      mkdirSync(path.dirname(path.join(checkout, adapter)), { recursive: true });
      copyFileSync(path.join(configsRoot, adapter), path.join(checkout, adapter));
    }
    // A stub launcher shows which checkout's `.ai` the adapters picked.
    mkdirSync(path.join(checkout, '.ai'), { recursive: true });
    writeFileSync(
      path.join(checkout, '.ai', 'codegraph.mjs'),
      `process.stdout.write(${JSON.stringify(stubContext)});\n`,
    );
  });

  after(() => rmSync(checkout, { recursive: true, force: true }));

  test('every adapter shares the same findAiRoot', () => {
    // Pi's pnpm-policy imports Pi's runtime, so it can't be loaded here; this
    // keeps it on the same lookup the loaded adapters below exercise.
    const findAiRoot = (adapter) =>
      readFileSync(path.join(configsRoot, adapter), 'utf8')
        .match(/^function findAiRoot\([\s\S]*?\n\}\n/m)?.[0]
        .replaceAll(': string', '');
    const [first, ...rest] = adapters.map(findAiRoot);
    assert.ok(first);
    for (const [index, other] of rest.entries()) {
      assert.equal(other, first, adapters[index + 1]);
    }
  });

  test('the CodeGraph adapters run the launcher of the checkout they are mirrored into', async () => {
    const pluginUrl = pathToFileURL(path.join(checkout, '.opencode', 'plugins', 'codegraph.js'));
    const { CodegraphPromptContext } = await import(pluginUrl.href);
    const hooks = await CodegraphPromptContext({ directory: checkout });
    const output = {
      message: { id: 'msg_1', sessionID: 'ses_1' },
      parts: [{ type: 'text', text: 'How does greet work?' }],
    };
    await hooks['chat.message']({ sessionID: 'ses_1' }, output);
    assert.equal(output.parts[1]?.text, stubContext);

    let handler;
    const extensionUrl = pathToFileURL(path.join(checkout, '.pi', 'extensions', 'codegraph.ts'));
    const { default: register } = await import(extensionUrl.href);
    register({ on: (_event, fn) => (handler = fn) });
    const result = await handler({ prompt: 'How does greet work?' }, { cwd: checkout });
    assert.equal(result?.message?.content, stubContext);
  });

  test('the OpenCode pnpm policy plugin loads from its mirrored path', async () => {
    const pluginUrl = pathToFileURL(path.join(checkout, '.opencode', 'plugins', 'pnpm-policy.js'));
    const { PnpmPolicy } = await import(pluginUrl.href);
    assert.equal(typeof PnpmPolicy, 'function');
  });
});

test('every Codex command hook has a commandWindows counterpart', () => {
  const codex = JSON.parse(readFileSync(path.join(configsRoot, '.codex', 'hooks.json'), 'utf8'));
  const commandHooks = Object.values(codex.hooks)
    .flat()
    .flatMap((entry) => entry.hooks)
    .filter((hook) => hook.type === 'command');

  assert.ok(commandHooks.length > 0, 'no command hooks found in .codex/hooks.json');
  for (const hook of commandHooks) {
    assert.ok(hook.commandWindows, `missing commandWindows for: ${hook.command}`);
  }
});

test('block-npm-commands.mjs is registered in all four harness configs', () => {
  const configFiles = [
    path.join(configsRoot, '.claude', 'settings.json'),
    path.join(configsRoot, '.codex', 'hooks.json'),
    path.join(configsRoot, '.opencode', 'plugins', 'pnpm-policy.js'),
    path.join(configsRoot, '.pi', 'extensions', 'pnpm-policy.ts'),
  ];
  for (const file of configFiles) {
    assert.match(readFileSync(file, 'utf8'), /block-npm-commands\.mjs/, file);
  }
});

test('package.json defines the canonical verify script', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(packageJson.scripts?.verify, 'package.json is missing a "verify" script');
});

test('every path setup.mjs mirrors actually exists', () => {
  assert.ok(
    existsSync(skillsRoot),
    '.ai/skills is missing (setup.mjs symlinks every harness to it)',
  );
  assert.ok(
    existsSync(path.join(configsRoot, 'AGENTS.md')),
    '.ai/configs/AGENTS.md is missing (CLAUDE.md aliases to it)',
  );

  const configFiles = listFiles(configsRoot);
  assert.ok(configFiles.length > 0, '.ai/configs has no files for setup.mjs to mirror');
  for (const file of configFiles) {
    assert.ok(existsSync(file), file);
  }
});

test('setup.mjs is actually idempotent: two runs both exit 0, and the second reports no conflicts', () => {
  const setupPath = path.join(aiRoot, 'setup.mjs');

  const first = spawnSync(process.execPath, [setupPath], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(first.status, 0, `first run failed:\n${first.stdout}\n${first.stderr}`);

  const second = spawnSync(process.execPath, [setupPath], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(second.status, 0, `second run failed:\n${second.stdout}\n${second.stderr}`);
  // Per-item lines start with "conflict "; the summary line ("0 created, N
  // already OK, 0 conflicts.") always contains the word "conflicts" even
  // when the count is zero, so match the line prefix, not the bare word.
  assert.doesNotMatch(
    second.stdout,
    /^conflict /m,
    `second run reported a conflict:\n${second.stdout}`,
  );
});

// --- block-npm-commands.mjs: a few common cases, not a full parser test ---

function runBlockNpmCommands(command) {
  const result = spawnSync(process.execPath, [path.join(hooksRoot, 'block-npm-commands.mjs')], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  return result.stdout?.trim() ? JSON.parse(result.stdout) : null;
}

test('block-npm-commands blocks common npm/npx forms', () => {
  const cases = [
    'npm install',
    'npx some-tool',
    'sudo npm install',
    'env FOO=bar npm test',
    'echo hi && npm install',
    'echo hi; npx some-tool',
  ];
  for (const command of cases) {
    const result = runBlockNpmCommands(command);
    assert.equal(result?.hookSpecificOutput?.permissionDecision, 'deny', command);
  }
});

test('block-npm-commands allows pnpm and unrelated commands', () => {
  const cases = ['pnpm install', 'pnpm run build', 'echo hello', 'git status'];
  for (const command of cases) {
    assert.equal(runBlockNpmCommands(command), null, command);
  }
});

test('block-npm-commands does not treat newlines as command separators', () => {
  // A multi-line heredoc/commit message passed as one quoted argument (e.g.
  // `git commit -m "$(cat <<'EOF' ... )"`) contains real newlines that
  // aren't shell separators — prose mentioning npm/npx on its own line
  // must not be treated as an executable invocation.
  const command = 'git commit -m "line one\nnpm/npx commands mentioned here\nline three"';
  assert.equal(runBlockNpmCommands(command), null, command);
});
