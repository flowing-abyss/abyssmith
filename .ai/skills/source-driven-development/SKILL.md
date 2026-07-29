---
name: source-driven-development
description: Grounds version-sensitive, unfamiliar, newly-introduced, deprecated, or compatibility-relevant framework/library decisions in official documentation. Not for code already established in the codebase, mechanical edits, or work fully defined by an approved Interfaces block.
---

# Source-Driven Development

## Overview

Every framework-specific code decision must be backed by official documentation. Don't implement from memory — verify, cite, and let the user see your sources. Training data goes stale, APIs get deprecated, best practices evolve. This skill ensures the user gets code they can trust because every pattern traces back to an authoritative source they can check.

## When to Use

Required when at least one of these is true:

- the API involved is unfamiliar — not something already used correctly elsewhere in this codebase
- correctness depends on the specific version in use (the pattern differs between versions)
- a new dependency is being added
- a library/framework upgrade or version migration is being performed
- the API is deprecated, experimental, or otherwise unstable
- the integration is security-sensitive
- behavior depends on platform/runtime compatibility
- the user explicitly asked for a documented or verified implementation
- the existing code and the official documentation look genuinely incompatible (see Precedence below)

**Not required — do not activate for:**

- any call to an Obsidian (or other) API already used correctly elsewhere in this codebase
- mechanical edits (renaming, formatting, moving files)
- local refactoring that doesn't change a contract
- code fully determined by an approved plan's `Interfaces` block or an existing type definition — implement to that, don't re-derive it from docs
- copying an existing, already-verified pattern from this project
- pure business logic with no framework/library surface
- the user explicitly wants speed over verification ("just do it quickly")

## Precedence

When official documentation, the approved spec/plan, and existing project code disagree, resolve in this order:

1. **The approved spec or plan** governs — it's what the user signed off on. Don't silently override it because current docs recommend something else.
2. **Project instructions and existing established patterns** (AGENTS.md/CLAUDE.md, conventions already used elsewhere in the codebase) govern next.
3. **Documentation is for verifying API usage** — correct function signatures, current vs. deprecated methods, parameter shapes — not for overriding 1 or 2.

Only surface a conflict when the documented API is genuinely incompatible with what's being built (a method was removed, a signature changed, a pattern is hard-deprecated with a stated removal date) — not merely because the docs show a newer style than the one already in use. "The docs demonstrate a different but equally valid approach" is not a conflict worth interrupting for.

Documentation never gets to force a rewrite of an approved design on its own. If an approved plan requires an API that genuinely no longer exists or was removed, that's a blocker on the plan itself — raise it before implementing, the same way any other plan defect gets raised (see `skill:subagent-driven-development`'s conflict-with-plan-text handling). Don't quietly implement around it and don't quietly implement the plan's broken version either.

## The Process

```
DETECT ──→ FETCH ──→ IMPLEMENT ──→ CITE
  │          │           │            │
  ▼          ▼           ▼            ▼
 What       Get the    Follow the   Show your
 stack?     relevant   documented   sources
            docs       patterns
```

### Step 1: Detect Stack and Versions

Read the project's dependency file to identify exact versions:

```
package.json    → Node/React/Vue/Angular/Svelte
composer.json   → PHP/Symfony/Laravel
requirements.txt / pyproject.toml → Python/Django/Flask
go.mod          → Go
Cargo.toml      → Rust
Gemfile         → Ruby/Rails
```

State what you found explicitly:

```
STACK DETECTED:
- React 19.1.0 (from package.json)
- Vite 6.2.0
- Tailwind CSS 4.0.3
→ Fetching official docs for the relevant patterns.
```

If versions are missing or ambiguous, **ask the user**. Don't guess — the version determines which patterns are correct.

### Step 2: Fetch Official Documentation

Fetch the specific documentation page for the feature you're implementing. Not the homepage, not the full docs — the relevant page.

**Source hierarchy (in order of authority):**

| Priority | Source | Example |
|----------|--------|---------|
| 1 | Official documentation | react.dev, docs.djangoproject.com, symfony.com/doc |
| 2 | Official blog / changelog | react.dev/blog, nextjs.org/blog |
| 3 | Web standards references | MDN, web.dev, html.spec.whatwg.org |
| 4 | Browser/runtime compatibility | caniuse.com, node.green |

**Not authoritative — never cite as primary sources:**

- Stack Overflow answers
- Blog posts or tutorials (even popular ones)
- AI-generated documentation or summaries
- Your own training data (that is the whole point — verify it)

**Be precise with what you fetch:**

```
BAD:  Fetch the React homepage
GOOD: Fetch react.dev/reference/react/useActionState

BAD:  Search "django authentication best practices"
GOOD: Fetch docs.djangoproject.com/en/6.0/topics/auth/
```

After fetching, extract the key patterns and note any deprecation warnings or migration guidance.

When official sources conflict with each other (e.g. a migration guide contradicts the API reference), surface the discrepancy to the user and verify which pattern actually works against the detected version.

### Step 3: Implement Following Documented Patterns

Write code that matches what the documentation shows:

- Use the API signatures from the docs, not from memory
- If the docs show a new way to do something, use the new way
- If the docs deprecate a pattern, don't use the deprecated version
- If the docs don't cover something, flag it as unverified

**When the documented API is genuinely incompatible with existing project code** (not just a newer alternative style — see Precedence above):

```
CONFLICT DETECTED:
The codebase calls `vault.read()` with a callback argument, but the
current Obsidian API docs show `read()` returning a Promise with no
callback overload — the callback form appears removed, not just
superseded.
(Source: docs.obsidian.md/Reference/TypeScript+API/Vault/read)

Per Precedence: this isn't "docs prefer a newer style" — the old
signature looks genuinely gone. Flagging rather than silently
switching, since that changes a call site the plan didn't call out.
→ Confirm before I update the call site.
```

Per Precedence, the approved spec/plan and existing project patterns still win for anything short of a real incompatibility — don't raise a conflict just because the docs show a different but equally valid approach.

### Step 4: Cite Your Sources

The rule is narrower than "every framework-specific pattern": **every
non-obvious, version-sensitive, newly introduced, deprecated, or
compatibility-relevant framework decision must be supported by an official
source.** A call to an API already established and working elsewhere in
this codebase doesn't need a fresh citation just because it's
framework-specific.

**Default citation location — not production code comments.** Citations
belong in whichever of these is active for the current work:

- the implementation plan's **Required sources** task section (see
  `skill:writing-plans`), when working from a plan
- the implementer's report, when working under `skill:subagent-driven-development`
- the final answer back to the user, for inline/conversational work

**In the plan or report:**

```markdown
**Required sources:**
- react.dev/reference/react/useActionState#usage — React 19 replaced the
  manual isPending/setIsPending pattern with this hook; used for the order
  form's submission state.
```

**In conversation (no plan in play):**

```
I'm using useActionState instead of manual useState for the
form submission state. React 19 replaced the manual
isPending/setIsPending pattern with this hook.

Source: https://react.dev/blog/2024/12/05/react-19#actions
"useTransition now supports async functions [...] to handle
pending states automatically"
```

**A source URL belongs in a code comment only when it explains one of these** —
not as a default habit:

- a non-obvious compatibility workaround
- a known platform limitation the code is working around
- deliberate use of a non-standard or unexpected API
- behavior a future reader could plausibly "simplify" into a bug

```typescript
// Obsidian's mobile WebView doesn't support the File System Access API —
// falls back to vault.adapter instead of the browser-native picker.
// Source: docs.obsidian.md/Plugins/Getting+started/Mobile+development
```

**Citation rules:**

- Full URLs, not shortened
- Prefer deep links with anchors where possible (e.g. `/useActionState#usage` over `/useActionState`) — anchors survive doc restructuring better than top-level pages
- Quote the relevant passage when it supports a non-obvious decision
- Include browser/runtime support data when recommending platform features
- If you cannot find documentation for a pattern, say so explicitly:

```
UNVERIFIED: I could not find official documentation for this
pattern. This is based on training data and may be outdated.
Verify before using in production.
```

Honesty about what you couldn't verify is more valuable than false confidence.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'm confident about this API" | Confidence is not evidence. Training data contains outdated patterns that look correct but break against current versions. Verify. |
| "Fetching docs wastes tokens" | Hallucinating an API wastes more. The user debugs for an hour, then discovers the function signature changed. One fetch prevents hours of rework. |
| "The docs won't have what I need" | If the docs don't cover it, that's valuable information — the pattern may not be officially recommended. |
| "I'll just mention it might be outdated" | A disclaimer doesn't help. Either verify and cite, or clearly flag it as unverified. Hedging is the worst option. |
| "This is a simple task, no need to check" | Simple tasks with wrong patterns become templates. The user copies your deprecated form handler into ten components before discovering the modern approach exists. |

## Red Flags

- Writing version-sensitive, unfamiliar, or deprecated-API code without checking the docs for that version
- Using "I believe" or "I think" about an API instead of citing the source
- Implementing a pattern without knowing which version it applies to
- Citing Stack Overflow or blog posts instead of official documentation
- Using deprecated APIs because they appear in training data
- Adding a new dependency, or upgrading one, without checking its current docs
- Delivering a version-sensitive or unfamiliar-API decision with no source recorded anywhere (plan, report, or final answer)
- Adding a source URL to a production code comment for a call that isn't a compatibility workaround, platform limitation, deliberate non-standard usage, or "looks simplifiable" trap
- Fetching an entire docs site when only one page is relevant
- Treating a stylistic difference from current docs as a conflict with an approved plan or existing project pattern

## Verification

After implementing with source-driven development:

- [ ] This work actually met one of the "When to Use" triggers — not activated for a call already established elsewhere in the codebase or a mechanical edit
- [ ] Framework and library versions were identified from the dependency file
- [ ] Official documentation was fetched for the version-sensitive/unfamiliar/deprecated patterns involved
- [ ] All sources are official documentation, not blog posts or training data
- [ ] Code follows the patterns shown in the current version's documentation
- [ ] Citations for non-trivial decisions landed in the plan's Required sources section, the implementer's report, or the final answer — not scattered into code comments by default
- [ ] Any code-comment citation explains a real compatibility workaround, platform limitation, deliberate non-standard usage, or simplification trap — not routine API usage
- [ ] No deprecated APIs are used (checked against migration guides)
- [ ] A genuine incompatibility between docs and an approved plan/existing pattern was raised as a blocker, not silently resolved either way
- [ ] Anything that could not be verified is explicitly flagged as unverified
