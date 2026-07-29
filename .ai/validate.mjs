#!/usr/bin/env node
// Structural validator for the .ai/ tooling tree. Checks objective,
// mechanically-verifiable properties only — it does not try to prove the
// absence of every possible semantic contradiction between Markdown files
// (see .ai/skills for the philosophy: custom skills feed the Superpowers
// process, they don't replace it — this script checks that the wiring for
// that claim actually holds, not that every sentence is self-consistent).
//
// `runValidate(aiRoot)` is exported so validate.test.mjs can point it at
// synthetic fixture trees (a copy of this repo's .ai/ with one thing
// deliberately broken) and assert on the specific error produced, instead
// of only ever running against this repo's own real, already-passing tree.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './is-main-module.mjs';

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

// Formal skill references use one of two standardized prefixes —
// "superpowers:<name>" (upstream skills, matches REQUIRED SUB-SKILL
// convention) or "skill:<name>" (any skill, used for cross-references
// within skill bodies). Deliberately narrow: this does not try to parse
// natural-language mentions like "see the risk skill" — only the
// standardized syntax is checked.
const FORMAL_SKILL_REF_PATTERN = /\b(?:superpowers|skill):([a-z][a-z0-9-]*)/g;

/**
 * @param {string} aiRoot absolute path to a `.ai` directory (real or fixture)
 * @returns {{ errors: string[], skillDocsChecked: number }}
 */
export function runValidate(aiRoot) {
  const repoRoot = path.join(aiRoot, '..');
  const skillsRoot = path.join(aiRoot, 'skills');
  const hooksRoot = path.join(aiRoot, 'hooks');

  const errors = [];
  const skillDirs = new Set(
    existsSync(skillsRoot)
      ? readdirSync(skillsRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
      : [],
  );
  const markdownFiles = existsSync(skillsRoot)
    ? listFiles(skillsRoot).filter((f) => f.endsWith('.md'))
    : [];

  checkRelativeLinksResolve();
  checkSuperpowersSkillReferences();
  checkRequiredSubSkillReferences();
  checkNoNpmInPnpmOnlyInstructions();
  checkCustomSkillsListedInUsingSuperpowers();
  checkDeprecationDoesNotReplaceBrainstorming();
  checkParallelAgentsHasNegativeTrigger();
  checkHookCapabilityManifest();
  checkReviewerPromptsMarkedOptional();
  checkCanonicalVerifyScriptExists();

  return { errors, skillDocsChecked: markdownFiles.length };

  // ---------------------------------------------------------------------

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

  function checkSuperpowersSkillReferences() {
    for (const file of markdownFiles) {
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(FORMAL_SKILL_REF_PATTERN)) {
        const name = match[1];
        if (!skillDirs.has(name)) {
          errors.push(`${relPath(file)}: references unknown skill "${match[0]}"`);
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
        const names = [...line.matchAll(FORMAL_SKILL_REF_PATTERN)].map((m) => m[1]);
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

  // Per-harness capability manifest: for each harness, each declared
  // capability's expected hook script must actually appear in that harness's
  // OWN config file — not just "referenced somewhere under .ai/configs/",
  // which would pass even if e.g. Codex's hook were only wired into Claude
  // Code's settings.json.
  function checkHookCapabilityManifest() {
    const manifestPath = path.join(hooksRoot, 'capability-manifest.json');
    if (!existsSync(manifestPath)) {
      errors.push('.ai/hooks/capability-manifest.json is missing');
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    for (const [harness, spec] of Object.entries(manifest.harnesses)) {
      const configPath = path.join(repoRoot, spec.configFile);
      if (!existsSync(configPath)) {
        errors.push(
          `capability-manifest.json: ${harness}'s configFile ${spec.configFile} does not exist`,
        );
        continue;
      }
      const configContent = readFileSync(configPath, 'utf8');

      for (const [capability, hookFile] of Object.entries(spec.capabilities ?? {})) {
        if (!existsSync(path.join(hooksRoot, hookFile))) {
          errors.push(
            `capability-manifest.json: ${harness}.${capability} names nonexistent hook ${hookFile}`,
          );
          continue;
        }
        if (!configContent.includes(hookFile)) {
          errors.push(
            `${harness}: capability "${capability}" expects ${hookFile} to be wired in ${spec.configFile}, but it isn't referenced there`,
          );
        }
      }
    }
  }

  // `pnpm run verify` is the single canonical gate CI, pre-push, branch
  // completion, and release all call — it must actually exist.
  function checkCanonicalVerifyScriptExists() {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    if (!existsSync(packageJsonPath)) return;
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (!packageJson.scripts?.verify) {
      errors.push('package.json is missing the canonical "verify" script');
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
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

// --- CLI ---
if (isMainModule(import.meta.url)) {
  const aiRoot = path.dirname(fileURLToPath(import.meta.url));
  const { errors, skillDocsChecked } = runValidate(aiRoot);

  if (errors.length > 0) {
    console.error(`validate:ai-config found ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`validate:ai-config passed (${skillDocsChecked} skill docs checked).`);
}
