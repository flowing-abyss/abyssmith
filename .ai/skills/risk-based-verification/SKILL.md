---
name: risk-based-verification
description: >
  Identifies which risk categories apply to a change and records the required
  checks as a compact section in the implementation plan. Use after design
  approval, during implementation-plan construction, before plan self-review
  and execution handoff. Complements Superpowers' writing-plans, TDD, and
  verification-before-completion; does not replace them or add a separate
  mandatory stage.
---

# Risk-Based Verification

## Purpose

Testing effort must follow risk, not file count or code coverage. This skill
identifies which risk categories genuinely apply to a change and turns that
into a few lines the plan and its reviewers can act on — it is not a
standalone process stage every task goes through.

## Ownership

Superpowers owns implementation planning, red-green-refactor, systematic
debugging, and completion verification. This skill owns exactly one thing:
deciding which risk categories apply to a change and what that implies for
verification, then handing that decision to `skill:writing-plans` to record.

## When to run this

```text
design approved
→ writing-plans starts building the implementation plan
→ applicability pass for custom implementation skills (writing-plans)
→ risk-based-verification, if it's one of the applicable skills
→ result recorded in the plan (this skill's output)
→ plan self-review (writing-plans)
→ execution handoff
```

Run this **while the implementation plan is being built** — after the
design/spec is approved (that's a `skill:brainstorming` output, not this skill's
job), as part of the same pass that produces the plan, and finished before
`skill:writing-plans`' Self-Review and execution handoff. It writes into the plan
that's still being drafted, not into one that's already been handed off —
there's no cycle where this skill reopens an approved plan.

Once per plan (or per task, for a task with materially different risk from
its siblings). **Do not re-run it after the plan is approved and handed
off** just because implementation is underway — that's scope the plan
already fixed. The only exception: implementation turns up a risk the
original pass didn't anticipate (a boundary the plan didn't know it would
touch, a migration that turned out to be needed). In that case, update the
plan's Risk-Based Verification section directly, don't restart the whole
pass.

## The risk categories

Evaluate each briefly — most changes trigger zero or one of these:

| Risk | Questions |
|---|---|
| Data integrity | Can data be lost, duplicated, reordered, or corrupted? |
| Authorization / security | Can authorization, validation, or secret handling regress? |
| Persistence or migration | Can stored data, schemas, or settings need a migration path? |
| External boundaries | Can external APIs, the filesystem, or the vault behave differently? |
| Concurrency | Can retries, races, or partial failure occur? |
| Compatibility | Can existing configs, persisted data, or the public API break? |
| Critical user workflow | Can a user-visible workflow fail despite unit tests passing? |

## Output: a plan section only when something applies

The categories above are a quick scan, not a mandatory report. If nothing
elevated beyond normal unit/integration/completion verification applies,
add nothing to the plan — no section, not even a "no risks" placeholder.
Most changes land here; this is the common case, not a shortcut.

If one or more categories genuinely apply, add exactly the plan's optional
`Risk-Based Verification` section (see `skill:writing-plans`), with only what's needed:

```markdown
## Risk-Based Verification

Applicable risks:
- Persistence: settings schema gains a new required field

Required checks:
- Migration test: old settings.json (pre-field) loads without throwing
- Regression test: default value applied when field is absent
```

Every applicable risk needs at least one concrete, executable check listed
under "Required checks" — a category with no check attached is not done.
Skip categories that don't apply; don't pad the list to look thorough, and
don't create the section at all when the answer is "nothing applies."

## Stop Conditions

Only when the plan actually has a Risk-Based Verification section:

- an applicable risk has no executable check in the plan section;
- a bug fix has no regression test;
- a migration has no tested path for existing data;
- only mocked behavior was tested for an external boundary that was flagged as a risk.

A plan with no Risk-Based Verification section at all is not a lesser or
incomplete plan — it's the correct output when the scan found nothing
elevated.
