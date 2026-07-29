import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives under `.ai/agent-configs/.opencode/plugins/` and is symlinked
// into `.opencode/plugins/`. Walk up from its real (symlink-resolved) location
// to find the `.ai` root, so this keeps working no matter how deep it's nested.
const hooksDir = path.join(findAiRoot(fileURLToPath(import.meta.url)), 'hooks');

function findAiRoot(fromPath) {
  let dir = path.dirname(fromPath);

  while (path.basename(dir) !== '.ai') {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find an ".ai" ancestor directory above ${fromPath}`);
    }
    dir = parent;
  }

  return dir;
}

// Capability classification for this adapter (see .ai/hooks/capability-manifest.json):
//
// - command-blocking (tool.execute.before): genuinely blocking, PROVIDED
//   OpenCode treats a thrown error from this hook as cancelling the tool
//   call — that's the documented contract this relies on, not independently
//   verified end-to-end in a live OpenCode session.
// - post-edit-lint (file.edited): same caveat — throws to surface the lint
//   failure as a tool-event error.
// - completion-verification (event/session.idle): NOTIFICATION-ONLY. This
//   only calls console.error; it does not throw and cannot block or fail
//   the session. Do not read this as equivalent to Claude Code's Stop hook,
//   which can return {decision: "block"} and actually stop the turn. The
//   primary completion guarantee is `finishing-a-development-branch`
//   running `pnpm run verify` directly — this handler is a diagnostic
//   backstop only, and a weaker one on this harness than on Claude Code/Codex.
// - session-bootstrap: NOT WIRED. See capability-manifest.json's
//   knownGaps.session-bootstrap — OpenCode's context-injection API wasn't
//   verified when this was written.
export const PnpmPolicy = async () => ({
  'tool.execute.before': async (input, output) => {
    if (input.tool !== 'bash') {
      return;
    }

    const result = runHook('block-npm-commands.mjs', {
      tool_input: { command: output.args?.command },
    });

    if (result?.hookSpecificOutput?.permissionDecision === 'deny') {
      throw new Error(result.hookSpecificOutput.permissionDecisionReason);
    }
  },
  'file.edited': async () => {
    const result = runHook('lint-after-edit.mjs', {});

    if (result?.decision === 'block') {
      throw new Error(result.reason);
    }
  },
  event: async ({ event }) => {
    if (event.type !== 'session.idle') {
      return;
    }

    // Notification-only — see the classification comment above. This does
    // not and cannot block the session; it only surfaces a log line.
    const result = runHook('verify-before-stop.mjs', {});

    if (result?.decision === 'block') {
      console.error(`[ai-hooks] pnpm verify failed after session went idle:\n${result.reason}`);
    }
  },
});

function runHook(scriptName, payload) {
  const child = spawnSync('node', [path.join(hooksDir, scriptName)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  if (!child.stdout?.trim()) {
    return null;
  }

  try {
    return JSON.parse(child.stdout);
  } catch {
    return null;
  }
}
