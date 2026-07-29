# Upstream Superpowers: provenance and local patches

`.ai/skills/` vendors the [obra/superpowers](https://github.com/obra/superpowers)
skill library directly (not installed as an external plugin — see this
template's `inject-superpowers.mjs` hook), plus six custom skills specific
to this template (listed in `using-superpowers/SKILL.md`'s Skill Priority
table).

## Source

Vendored from `obra/superpowers`. The exact commit/tag this copy was taken
from was not recorded at vendoring time — before the next sync, record it
here (`git log` on the upstream repo, or the release tag if one was used) so
future updates can diff against a known baseline instead of guessing.

## Principle

Prefer **not** editing upstream skill files. When a project-specific need
arises, the preferred order is:

1. Project instructions (`AGENTS.md`)
2. A custom skill (`.ai/skills/<name>/`)
3. Task-plan integration (an optional section in `writing-plans`'s task
   template, a script like `task-brief`)
4. A hook or the `validate:ai-config` structural validator
5. Only when none of the above fit: a minimal, documented patch to an
   upstream skill file

## Locally patched upstream files

| File | Change | Reason |
|---|---|---|
| `using-git-worktrees/SKILL.md` | Step 2/3 package-manager detection now checks `packageManager` field / lockfile (pnpm → yarn → npm) instead of unconditionally running `npm install` / `npm test` | This template is pnpm-only; the upstream skill's hardcoded npm commands directly conflicted with that policy and would silently do the wrong thing (or fail via the pnpm-only command-blocking hook) on every worktree setup. |
| `dispatching-parallel-agents/SKILL.md` | Added an explicit "Do not use for implementing tasks from one implementation plan in a shared working tree — use subagent-driven-development instead" section and the same line in the frontmatter description | Nothing in the original skill warned against dispatching multiple implementers from the same plan in parallel, which conflicts with `subagent-driven-development`'s sequential one-implementer-at-a-time model and causes real file conflicts in a shared working tree. |
| `writing-plans/SKILL.md` | Task Structure template gained five optional sections (Project-specific requirements, Required sources, Risk-based checks, Observability requirements, Migration requirements) | This template's custom skills (`source-driven-development`, `risk-based-verification`, `observability-and-instrumentation`, `deprecation-and-migration`) need a place to hand their findings to the implementer and reviewer without either one re-running the skill's own routing logic. The plan is the natural handoff point `subagent-driven-development` already reads from. |
| `subagent-driven-development/scripts/task-brief` | Now prepends the plan's `## Global Constraints` section to every task brief, not just the task's own text block | Global Constraints (and, by extension, any of `writing-plans`' new optional per-task sections) previously reached the task *reviewer* (the controller was instructed to copy them into the reviewer's dispatch) but not the *implementer*, who only ever sees the brief file. That's exactly the requirements-lost-at-the-subagent-boundary failure mode this integration exists to prevent. |

## Not upstream — added by this template

`context-engineering`, `source-driven-development`, `risk-based-verification`,
`observability-and-instrumentation`, `deprecation-and-migration`,
`releasing-an-obsidian-plugin`, and `.ai/validate.mjs` are original to this
template, not vendored. They're documented in their own `SKILL.md` files and
in `using-superpowers/SKILL.md`'s Skill Priority table, not here.
