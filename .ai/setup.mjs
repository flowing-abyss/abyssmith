#!/usr/bin/env node
// Bootstraps every AI-agent config from the canonical sources under `.ai/`.
//
// `.ai/` is the only agent-tooling directory tracked in git. `.claude/`, `.codex/`,
// `.forge/`, `.opencode/`, `.pi/`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json`,
// and `opencode.json` are all gitignored, machine-local, and rebuilt by this script.
// Run it after cloning, or any time an agent dir looks empty:
//
//   node .ai/setup.mjs
//
// Safe to re-run: existing correct links are left alone, and anything that isn't
// already the expected link is reported and skipped rather than overwritten.
//
// `.ai/configs/` is laid out as a literal mirror of the repo root — e.g.
// `.ai/configs/.codex/hooks.json` becomes `<repo-root>/.codex/hooks.json`.
// To wire up a new agent config, just add the file at its real repo-root-relative
// path under `.ai/configs/` and re-run this script; nothing else to edit.
//
// Real symlinks require Administrator privileges or Windows Developer Mode,
// so `pnpm install` would fail on an ordinary Windows account. Directory
// links use junctions instead (no elevation needed); file links use hard
// links, falling back to a plain copy if the filesystem can't hard-link
// (e.g. across volumes). Both are POSIX no-ops — `type` is ignored there.

import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';

const aiRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(aiRoot, '..');
process.chdir(repoRoot);

const configsRoot = path.join(aiRoot, 'configs');

const links = [
  // Skills: every agent that understands the shared SKILL.md convention reads
  // from one of these paths. Not part of the configs mirror because it's
  // a shared directory symlink, not a 1:1 file mirror.
  ['.claude/skills', '.ai/skills'],
  ['.forge/skills', '.ai/skills'],
  ['.opencode/skills', '.ai/skills'],
  ['.pi/skills', '.ai/skills'],
  ['.agents/skills', '.ai/skills'],

  // AGENTS.md is the canonical agent-instructions file (mirrored from
  // `.ai/configs/AGENTS.md` below, like everything else). CLAUDE.md is
  // just a name Claude Code specifically looks for, so it links straight to
  // the same real source rather than to the generated AGENTS.md link — that
  // way it doesn't depend on link-creation order or a generated link's
  // still-linkable state.
  ['CLAUDE.md', path.join('.ai/configs', 'AGENTS.md')],

  // Hooks + MCP config: every file under `.ai/configs/` mirrored to the
  // same relative path at the repo root.
  ...listFiles(configsRoot).map((absolutePath) => {
    const relativePath = path.relative(configsRoot, absolutePath);
    return [relativePath, path.join('.ai/configs', relativePath)];
  }),
];

let created = 0;
let skipped = 0;
let conflicts = 0;

for (const [linkPath, targetPath] of links) {
  const result = ensureLink(linkPath, targetPath);
  if (result === 'created') created += 1;
  if (result === 'skipped') skipped += 1;
  if (result === 'conflict') conflicts += 1;
}

console.log(`\n${created} created, ${skipped} already OK, ${conflicts} conflicts.`);
if (conflicts > 0) {
  console.log('Resolve conflicts above manually, then re-run this script.');
  process.exitCode = 1;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function ensureLink(linkPath, targetPath) {
  let isDirTarget;
  try {
    isDirTarget = statSync(targetPath).isDirectory();
  } catch (error) {
    console.log(`conflict ${linkPath}: source ${targetPath} does not exist (${error.message})`);
    return 'conflict';
  }

  // POSIX symlinks and Windows junctions both resolve/report through the
  // same fs.symlinkSync/readlinkSync API; hard links and copies don't.
  const usesSymlinkApi = !isWindows || isDirTarget;
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath);
  const absoluteTarget = path.resolve(targetPath);
  // Windows junctions always store (and readlinkSync returns) an absolute
  // path; POSIX symlinks use the relative target we pass to symlinkSync.
  const expectedLinkValue = isWindows && isDirTarget ? absoluteTarget : relativeTarget;

  mkdirSync(path.dirname(linkPath), { recursive: true });

  if (existsSync(linkPath) || isBrokenSymlink(linkPath)) {
    if (isExistingLinkCorrect(linkPath, targetPath, expectedLinkValue, usesSymlinkApi)) {
      console.log(`ok       ${linkPath}`);
      return 'skipped';
    }

    console.log(`conflict ${linkPath} (exists and is not the expected link to ${relativeTarget})`);
    return 'conflict';
  }

  try {
    createLink(linkPath, targetPath, relativeTarget, isDirTarget);
  } catch (error) {
    console.log(
      `conflict ${linkPath}: could not create link to ${relativeTarget} (${error.message})`,
    );
    return 'conflict';
  }

  console.log(`created  ${linkPath} -> ${relativeTarget}`);
  return 'created';
}

function createLink(linkPath, targetPath, relativeTarget, isDirTarget) {
  if (!isWindows) {
    symlinkSync(relativeTarget, linkPath);
    return;
  }

  if (isDirTarget) {
    // `type: 'junction'` needs no elevation, unlike a real directory symlink.
    // Node normalizes the target to an absolute path for junctions itself.
    symlinkSync(targetPath, linkPath, 'junction');
    return;
  }

  try {
    // Hard link: no elevation needed, but same-volume only.
    linkSync(targetPath, linkPath);
  } catch {
    // Cross-volume or an unsupporting filesystem — a plain copy still gets
    // the harness working; it just won't reflect future edits to the source
    // until setup.mjs is re-run.
    copyFileSync(targetPath, linkPath);
  }
}

function isExistingLinkCorrect(linkPath, targetPath, expectedLinkValue, usesSymlinkApi) {
  let stat;
  try {
    stat = lstatSync(linkPath);
  } catch {
    return false;
  }

  if (usesSymlinkApi) {
    return stat.isSymbolicLink() && readlinkSync(linkPath) === expectedLinkValue;
  }

  // Windows file link: correct if it's a real hard link (same inode) to the
  // source, or — for the copy fallback — has identical content.
  if (!stat.isFile()) {
    return false;
  }
  const targetStat = statSync(targetPath);
  if (stat.dev === targetStat.dev && stat.ino === targetStat.ino) {
    return true;
  }
  try {
    return readFileSync(linkPath).equals(readFileSync(targetPath));
  } catch {
    return false;
  }
}

function isBrokenSymlink(linkPath) {
  try {
    return lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}
