import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { isToolCallEventType } from '@earendil-works/pi-coding-agent';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives under `.ai/agent-configs/.pi/extensions/` and is symlinked
// into `.pi/extensions/`. Walk up from its real (symlink-resolved) location to
// find the `.ai` root, so this keeps working no matter how deep it's nested.
const hooksDir = path.join(findAiRoot(fileURLToPath(import.meta.url)), 'hooks');

function findAiRoot(fromPath: string): string {
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

export default function (pi: ExtensionAPI): void {
  pi.on('tool_call', async (event) => {
    if (!isToolCallEventType('bash', event)) {
      return;
    }

    const result = runHook('block-npm-commands.mjs', {
      tool_input: { command: event.input.command },
    });

    if (result?.hookSpecificOutput?.permissionDecision === 'deny') {
      return { block: true, reason: result.hookSpecificOutput.permissionDecisionReason };
    }
  });

  pi.on('tool_result', async (event) => {
    if (event.toolName !== 'write' && event.toolName !== 'edit') {
      return;
    }

    const result = runHook('lint-after-edit.mjs', {});

    if (result?.decision === 'block') {
      return { isError: true, content: [{ type: 'text', text: result.reason }] };
    }
  });

  pi.on('agent_settled', async () => {
    const result = runHook('verify-before-stop.mjs', {});

    if (result?.decision === 'block') {
      console.error(`[ai-hooks] pnpm verify failed after the agent settled:\n${result.reason}`);
    }
  });
}

function runHook(scriptName: string, payload: unknown): any {
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
