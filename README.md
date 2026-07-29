# Abyssmith

An Obsidian plugin template built for agent-driven development. Clone this repository, tell your agent what to build, and development starts immediately. Skills, hooks, and quality gates come already wired in.

## What makes this different

**Real Obsidian runs in CI.** Every push builds the plugin and launches it inside an actual Obsidian instance on Ubuntu, Windows, and macOS, plus the real Android app on a device emulator. Each run confirms the plugin genuinely loads.

**The template is agent-native.** Skills, project instructions, and lifecycle hooks are pre-wired for Claude Code, Codex, OpenCode, and Pi. They lint after every edit, run the full verification gate when an agent is about to claim a branch complete, and enforce this project's pnpm-only policy automatically.

**Harness support status:**

| Capability                   | Claude Code | Codex       | OpenCode    | Pi          |
| ---------------------------- | ----------- | ----------- | ----------- | ----------- |
| Shared skills                | yes         | yes         | yes         | yes         |
| Session bootstrap hook       | yes         | best-effort | best-effort | best-effort |
| Command blocking (pnpm-only) | yes         | best-effort | best-effort | best-effort |
| Post-edit lint               | yes         | best-effort | best-effort | best-effort |
| Completion verification      | yes         | best-effort | best-effort | best-effort |
| Subagent dispatch            | yes         | unknown     | unknown     | unknown     |

"yes" means run and confirmed working in this repo. "best-effort" means the config matches that harness's own published hook/plugin schema at the time of writing, but hasn't been independently executed end-to-end here. "unknown" means unverified either way. `node .ai/setup.mjs` reports which config files are present for each harness, which is necessary but not sufficient for a "yes."

**Every release ships fully verified.** Strict TypeScript, a complete lint, type, test, and build gate run before every commit and every push. The release command bumps the version only after the plugin passes its full local suite and the real-Obsidian end-to-end tests.

**One command finishes setup.** `pnpm install` wires up git hooks and every agent's configuration together.

## Get started

```bash
pnpm install
```

Then tell your agent what you're building.
