---
name: deprecation-and-migration
description: Manages deprecation and migration for changes to an external or persisted contract — settings/data format, public API or command, or a user-facing feature that needs a compatibility path. Not for internal refactoring, renaming, or dead-code removal with no external contract change.
---

# Deprecation and Migration

## Where this sits in the workflow

This skill is an entry point parallel to `skill:brainstorming` for removal- or
migration-shaped requests — it is not an alternative to `skill:brainstorming` and
`skill:writing-plans`, and it does not go straight to implementation.

```text
removal or migration request
→ deprecation-and-migration (this skill: contract analysis and migration constraints)
→ brainstorming (design approval, using this skill's output as input)
→ writing-plans
→ implementation
→ verification
```

Use this skill first to answer the five questions below. Then hand that to
`skill:brainstorming` as the input for design approval, same as any other
spec input — do not skip straight from this skill's decision to writing code.

## When to use

Only when the change touches an external or persisted contract:

- the format of persisted settings or plugin data (`data.json`)
- a public API or command this plugin exposes (other plugins or the
  command palette depend on it)
- a user-facing setting or feature that needs a compatibility path so
  existing users aren't broken by the change
- a dependency/API migration that affects stored data or user-visible behavior

**Not this skill:**

- removing internal dead code
- private refactoring with no external contract change
- renaming an internal function
- swapping an implementation while keeping the same external contract
- deleting an unused file

## The five questions

Answer all five before handing off to `skill:brainstorming`:

1. **What contract or persisted data is changing?** Name it exactly (a
   settings field, a command id, a public method).
2. **What could already depend on the old form?** Existing users' saved
   settings, other plugins calling this one, community themes/snippets
   relying on a DOM class or CSS variable.
3. **Does this need an automatic migration, or a compatibility fallback?**
   If old data needs transforming, when does that run (on load)? If old
   behavior needs to keep working for a while, what's the fallback?
4. **What happens on rollback?** If the user reverts to an older plugin
   version after this ships, does their data still load?
5. **When is it safe to remove the old form?** What has to be true first
   (a released version where the new form has existed for at least one
   version, so a rollback within that window still works)?

## Principles

- **Never silently lose persisted user data.** A settings/data migration
  that can't be applied cleanly must fail loudly (a clear error/Notice),
  not drop fields or reset to defaults without telling the user.
- **The destructive step comes after the compatibility/migration step**,
  not in the same change. Add the new form and migrate/fall back first;
  remove the old form only in a later, separate change.
- **Old settings either load correctly or fail with a clear, actionable
  error** — never a silent partial load or a confusing crash.
- **Every migration has a testable rollback, or the irreversibility is
  explicitly documented and the user is told before it happens.** There's
  no telemetry and no way to check "how many users are on the old
  version" — decide the removal timeline from release versions, not usage data.

## Verification

- [ ] The five questions above are answered, not skipped
- [ ] A test loads data/settings in the OLD format and confirms it either
      migrates correctly or fails with a clear, actionable error — not a
      silent partial load
- [ ] The destructive removal step is a separate, later change from the
      compatibility/migration step, not bundled into the same one
- [ ] Rollback behavior (old plugin version reading new-format data) was
      considered and is either safe or explicitly documented as unsafe
