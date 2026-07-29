#!/usr/bin/env node
// Structural validator for the .ai/ tooling tree. Checks objective,
// mechanically-verifiable properties only — it does not try to prove the
// absence of every possible semantic contradiction between Markdown files
// (see .ai/skills for the philosophy: custom skills feed the Superpowers
// process, they don't replace it — this script checks that the wiring for
// that claim actually holds, not that every sentence is self-consistent).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aiRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(aiRoot, '..');
const skillsRoot = path.join(aiRoot, 'skills');
const hooksRoot = path.join(aiRoot, 'hooks');
const configsRoot = path.join(aiRoot, 'configs');

const errors = [];
const skillDirs = new Set(
  readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name),
);
const markdownFiles = listFiles(skillsRoot).filter((f) => f.endsWith('.md'));

// writing-skills is vendored upstream meta-documentation about how to write
// skills; its links are illustrative filenames for a hypothetical skill
// package, not real navigation targets in this repo.
const LINK_CHECK_EXCLUDED_DIRS = ['writing-skills'];

// Generic vendored upstream skills that use npm/pytest/etc. as cross-language
// educational placeholders, unrelated to this repo's actual pnpm-only
// procedures. using-git-worktrees is excluded because it was patched to
// detect the package manager conditionally (pnpm/yarn/npm as a fallback for
// whatever *other* project it runs in) rather than assume npm — see the
// local patch note in that file.
const NPM_CHECK_EXCLUDED_DIRS = [
  'writing-skills',
  'systematic-debugging',
  'test-driven-development',
  'using-git-worktrees',
];

checkRelativeLinksResolve();
checkSuperpowersSkillReferences();
checkRequiredSubSkillReferences();
checkNoNpmInPnpmOnlyInstructions();
checkCustomSkillsListedInUsingSuperpowers();
checkDeprecationDoesNotReplaceBrainstorming();
checkParallelAgentsHasNegativeTrigger();
checkHooksAreRegistered();
checkReadmeCapabilityClaims();
checkCompletionHookCallsCanonicalScript();
checkReviewerPromptsMarkedOptional();

if (errors.length > 0) {
  console.error(`validate:ai-config found ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`validate:ai-config passed (${markdownFiles.length} skill docs checked).`);

// ---------------------------------------------------------------------------

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function relPath(p) {
  return path.relative(repoRoot, p);
}

function isUnderDir(file, dirNames) {
  const rel = path.relative(skillsRoot, file);
  return dirNames.some((d) => rel === d || rel.startsWith(`${d}${path.sep}`));
}

// All relative Markdown links ([text](path)) must resolve to a real file,
// relative to the linking file's own directory. Skips http(s)/mailto/anchor-only links.
function checkRelativeLinksResolve() {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

  for (const file of markdownFiles) {
    if (isUnderDir(file, LINK_CHECK_EXCLUDED_DIRS)) continue;
    const content = readFileSync(file, 'utf8');
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      const target = match[1].split('#')[0].trim();
      if (!target || /^([a-z]+:)?\/\//i.test(target) || target.startsWith('mailto:')) {
        continue;
      }
      const resolved = path.resolve(path.dirname(file), target);
      if (!existsSync(resolved)) {
        errors.push(`${relPath(file)}: link target does not exist: ${target}`);
      }
    }
  }
}

// "Use superpowers:<name>" / "superpowers:<name>" references must name a real skill dir.
function checkSuperpowersSkillReferences() {
  const pattern = /superpowers:([a-z][a-z0-9-]*)/g;

  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (!skillDirs.has(name)) {
        errors.push(`${relPath(file)}: references unknown skill "superpowers:${name}"`);
      }
    }
  }
}

// "REQUIRED SUB-SKILL: Use ... X" lines must name a real skill.
function checkRequiredSubSkillReferences() {
  const linePattern = /REQUIRED SUB-SKILL:.*$/gim;

  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8');
    let match;
    while ((match = linePattern.exec(content)) !== null) {
      const line = match[0];
      const names = [...line.matchAll(/superpowers:([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
      for (const name of names) {
        if (!skillDirs.has(name)) {
          errors.push(`${relPath(file)}: REQUIRED SUB-SKILL names unknown skill "${name}"`);
        }
      }
    }
  }
}

// No executable `npm ...` / `npx ...` inside fenced code blocks in skill docs.
// A line that lists multiple ecosystem alternatives separated by " / "
// (e.g. "npm test / cargo test / pytest") is documentation, not an
// executable instruction for this pnpm-only template — excluded.
function checkNoNpmInPnpmOnlyInstructions() {
  // Only bash/sh/shell fences are executable instructions; fences in other
  // languages (markdown, python, typescript, ...) are illustrative examples.
  const fencePattern = /```(bash|sh|shell)\n([\s\S]*?)```/g;
  const npmPattern = /(^|[^./\w-])(npm (install|ci|test|run|start|exec)\b|npx )/;

  for (const file of markdownFiles) {
    if (isUnderDir(file, NPM_CHECK_EXCLUDED_DIRS)) continue;
    const content = readFileSync(file, 'utf8');
    let fenceMatch;
    while ((fenceMatch = fencePattern.exec(content)) !== null) {
      const block = fenceMatch[2];
      for (const line of block.split('\n')) {
        if (line.includes(' / ')) continue; // documented multi-ecosystem alternatives
        if (npmPattern.test(line)) {
          errors.push(
            `${relPath(file)}: executable npm/npx command in a pnpm-only template: "${line.trim()}"`,
          );
        }
      }
    }
  }
}

function checkCustomSkillsListedInUsingSuperpowers() {
  const customSkills = [
    'context-engineering',
    'source-driven-development',
    'risk-based-verification',
    'observability-and-instrumentation',
    'deprecation-and-migration',
    'releasing-an-obsidian-plugin',
  ];
  const usingSuperpowersPath = path.join(skillsRoot, 'using-superpowers', 'SKILL.md');
  if (!existsSync(usingSuperpowersPath)) {
    errors.push('using-superpowers/SKILL.md is missing');
    return;
  }
  const content = readFileSync(usingSuperpowersPath, 'utf8');
  for (const name of customSkills) {
    if (!skillDirs.has(name)) {
      errors.push(`custom skill directory missing: ${name}`);
      continue;
    }
    if (!content.includes(`\`${name}\``)) {
      errors.push(`using-superpowers/SKILL.md does not list custom skill "${name}"`);
    }
  }
}

function checkDeprecationDoesNotReplaceBrainstorming() {
  const file = path.join(skillsRoot, 'deprecation-and-migration', 'SKILL.md');
  if (!existsSync(file)) {
    errors.push('deprecation-and-migration/SKILL.md is missing');
    return;
  }
  const content = readFileSync(file, 'utf8');
  if (!/brainstorming/.test(content)) {
    errors.push(
      'deprecation-and-migration/SKILL.md does not reference brainstorming — it must hand off to brainstorming for design approval, not replace it',
    );
  }
}

function checkParallelAgentsHasNegativeTrigger() {
  const file = path.join(skillsRoot, 'dispatching-parallel-agents', 'SKILL.md');
  if (!existsSync(file)) {
    errors.push('dispatching-parallel-agents/SKILL.md is missing');
    return;
  }
  const content = readFileSync(file, 'utf8');
  if (!/shared working tree/i.test(content) || !/subagent-driven-development/.test(content)) {
    errors.push(
      'dispatching-parallel-agents/SKILL.md is missing the negative trigger against implementing shared-plan tasks in a shared working tree',
    );
  }
}

// Every hook file under .ai/hooks/ must be referenced by name somewhere
// under .ai/configs/ (its actual harness registration), not just exist.
function checkHooksAreRegistered() {
  if (!existsSync(hooksRoot)) return;
  const hookFiles = readdirSync(hooksRoot).filter((f) => f.endsWith('.mjs'));
  const configFiles = listFiles(configsRoot);
  const configContent = configFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

  for (const hook of hookFiles) {
    if (!configContent.includes(hook)) {
      errors.push(`.ai/hooks/${hook} exists but is not referenced by any file under .ai/configs/`);
    }
  }
}

// README hook/harness claims should name only harnesses that actually have
// a config directory under .ai/configs/.
function checkReadmeCapabilityClaims() {
  const readmePath = path.join(repoRoot, 'README.md');
  if (!existsSync(readmePath)) return;
  const readme = readFileSync(readmePath, 'utf8');
  const harnessDirs = {
    'Claude Code': '.claude',
    Codex: '.codex',
    OpenCode: '.opencode',
    Pi: '.pi',
  };
  for (const [name, dir] of Object.entries(harnessDirs)) {
    if (readme.includes(name) && !existsSync(path.join(configsRoot, dir))) {
      errors.push(`README.md mentions ${name} but .ai/configs/${dir} does not exist`);
    }
  }
}

// The Stop-hook completion check must call the canonical `pnpm run verify`
// script, not a hardcoded, potentially weaker, list of individual commands.
function checkCompletionHookCallsCanonicalScript() {
  const file = path.join(hooksRoot, 'verify-before-stop.mjs');
  if (!existsSync(file)) {
    errors.push('.ai/hooks/verify-before-stop.mjs is missing');
    return;
  }
  const content = readFileSync(file, 'utf8');
  if (!/['"]verify['"]/.test(content)) {
    errors.push(
      'verify-before-stop.mjs does not appear to call the canonical "verify" package script',
    );
  }
}

function checkReviewerPromptsMarkedOptional() {
  const candidates = [
    path.join(skillsRoot, 'brainstorming', 'spec-document-reviewer-prompt.md'),
    path.join(skillsRoot, 'writing-plans', 'plan-document-reviewer-prompt.md'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    if (!/optional|manual|high-assurance/i.test(content.split('\n').slice(0, 6).join('\n'))) {
      errors.push(
        `${relPath(file)}: not clearly marked optional/manual/high-assurance near the top of the file`,
      );
    }
  }
}
