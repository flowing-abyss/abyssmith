---
name: observability-and-instrumentation
description: Makes plugin failures visible to the user and diagnosable from a bug report, without telemetry. Use when adding any file I/O, network call, or parsing step that can fail. Use when a user reports "it doesn't work" with no other detail.
---

# Observability and Instrumentation (Obsidian plugin edition)

## Why this looks different from the usual version of this skill

There's no server, no on-call, no metrics backend, no dashboards — a plugin runs on someone else's machine and the only diagnostic channel is whatever the user chooses to paste into a GitHub issue. AGENTS.md already rules out the usual fallback (phone-home telemetry: no hidden analytics, no undisclosed network calls). So "observability" here means exactly two things: **the user sees that something went wrong and why**, and **a developer reading a bug report has enough to reproduce it** — both from information already on the user's own screen.

## When to use

- Any `app.vault`/`app.fileManager` read, write, or path resolution that can fail (missing file, permission error, malformed frontmatter)
- Any `fetch`/network call (already requires disclosure per AGENTS.md — pair that disclosure with visible failure handling)
- Any parsing of user-authored content (settings JSON, a config file the plugin reads from the vault)
- A silent `catch {}` or a promise rejection with no `.catch` — the classic "plugin just stops working" bug class

## Process

### 1. One user-facing error boundary per user-triggered operation, not a `Notice()` per `await`

Every user-triggered operation (a command, a settings action, anything the
user directly initiated) has **exactly one** layer responsible for turning
a failure into a `Notice()`. That's normally the top of the call stack for
that operation — the command handler, the button's click handler — not
every function it calls along the way.

```typescript
// BAD — every layer shows its own Notice: one real failure, three toasts,
// and the caller has no idea whether it's safe to treat this as handled
async function loadFontsFrom(folder: string): Promise<void> {
  try {
    await this.app.vault.adapter.list(folder);
  } catch (error) {
    new Notice(`Could not read folder "${folder}"`); // boundary #1
    throw error;
  }
}

async function applyFontSettings(): Promise<void> {
  try {
    await loadFontsFrom(this.settings.fontFolder);
  } catch (error) {
    new Notice('Failed to apply font settings'); // boundary #2 — same failure, second toast
  }
}

// GOOD — one boundary. The low-level function propagates (or rethrows with
// context); only the command handler that started the operation shows a Notice.
async function loadFontsFrom(folder: string): Promise<FileStat[]> {
  // No try/catch here — this function can't fully recover from a missing
  // folder, so it lets the error propagate to whoever called it.
  return this.app.vault.adapter.list(folder);
}

async function applyFontSettings(): Promise<void> {
  // No try/catch here either — same reasoning, one level further up.
  await loadFontsFrom(this.settings.fontFolder);
}

// The command handler is the boundary: it's the only place that knows this
// was a user-triggered action and is responsible for telling the user.
this.addCommand({
  id: 'apply-font-settings',
  name: 'Apply font settings',
  callback: async () => {
    try {
      await applyFontSettings();
    } catch (error) {
      new Notice(`Could not apply font settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
```

A lower-level function has exactly three legitimate options when something
fails, and none of them is "show a Notice and continue as if it worked":

- **Propagate** — no `try`/`catch` at all; let the caller decide.
- **Enrich and rethrow** — catch only to attach context the caller couldn't
  reconstruct (which file, which setting), then `throw` again.
- **Fully recover** — catch, handle it completely (a sensible default, a
  retry that actually succeeds), and continue for real. If you can't
  actually recover, this isn't the option — use one of the two above.

Catching an error, showing a `Notice()`, and then returning as if the
operation succeeded is never correct — the caller (and the user, past the
toast) has no way to tell the operation didn't finish.

A `Notice()` is the plugin's entire "alerting" system. Word it like an
on-call runbook line: name what was being attempted and what specifically
failed — not just "An error occurred."

### Background operations without a direct user action

A background operation (a periodic sync, a file-watcher callback) has no
single user action to attribute a `Notice()` to, so it isn't required to
show one on every failure. It still isn't allowed to fail silently:

- update whatever visible state reflects it, if there is one (a status bar
  item, a settings-tab indicator) — that's the equivalent of this
  operation's error boundary;
- log diagnostic detail (see below);
- never just swallow the error and leave no trace anywhere.

### 2. `console.error`/`console.warn` for the part a Notice can't hold

Obsidian's own guidelines only allow `warn`/`error`/`debug` console methods (already enforced by `eslint-plugin-obsidianmd`'s `no-console` override). Use them for the detail a toast is too small for — stack traces, the full failing object — since that's what ends up in a screenshot of DevTools attached to a bug report:

```typescript
console.error('[your-plugin-id] Failed to parse font manifest', { path, cause: error });
```

Prefix with the plugin id so it's greppable in a console full of every other plugin's output.

### 3. A debug-mode setting, not always-on verbose logging

If a feature needs step-by-step tracing to debug, gate it behind a settings toggle (`this.settings.debugLoggingEnabled`) rather than always emitting it — matches the "minimize noise" spirit of Obsidian's console-usage guideline, and gives users a switch to flip when a maintainer asks "can you enable debug logging and reproduce?"

### 4. Make errors reproducible, not just visible

When catching an error you can't fully handle, include what a maintainer needs to reproduce it: the input that failed (file path, setting value), not just the exception message. This is the entire substitute for a trace/correlation ID — there's no distributed system to correlate across, just one bug report to make useful.

## Explicitly not applicable here

Metrics, dashboards, distributed tracing, alerting/paging, SLOs, cardinality — all assume a backend collecting data from many instances of a running service. A plugin has neither the backend nor (per this template's own privacy stance) permission to phone one. Don't reach for OpenTelemetry/Prometheus/etc. for an Obsidian plugin; if a future feature genuinely needs opt-in usage analytics, that's a `source-driven-development`-grounded, explicitly-disclosed decision on its own, not something this skill covers.

## Red Flags

- A `catch {}` with nothing inside it
- A promise with no `.catch` in a place Vitest's unhandled-rejection reporting won't cover (see `test-driven-development` — but don't rely on tests catching every runtime path a real user hits)
- An error message that's just the raw exception (`String(error)`) with no context about what the plugin was trying to do
- More than one `Notice()` for the same failure — a sign the boundary isn't actually singular (a lower-level function is catching-and-toasting instead of propagating)
- A `catch` that shows a `Notice()` and then lets execution continue as though the operation succeeded
- `console.log`/`console.info` used as a substitute for a real `Notice()` on a user-triggered operation — the user isn't watching the console
- Reaching for a network call, analytics SDK, or crash reporter to "get visibility" — that's the thing AGENTS.md already says not to do without disclosure

## Verification

- [ ] Every user-triggered operation has exactly one identified user-facing error boundary — not zero, not one per layer it passes through
- [ ] That boundary's `Notice()` names what was attempted and what failed, not just "An error occurred"
- [ ] Lower-level functions propagate or enrich-and-rethrow errors they can't fully recover from — none of them catches, shows a `Notice()`, and returns normally
- [ ] After an error, the code does not report or imply the operation succeeded
- [ ] No silent `catch {}` and no unhandled promise rejection
- [ ] Background operations with no direct user action update visible state (if any) and log diagnostics instead of failing silently — they aren't required to show a `Notice()`
- [ ] Anything logged to console goes through `warn`/`error`/`debug` (not `log`), prefixed with the plugin id, with enough context (plugin id, the input that failed) to reproduce from a bug report
- [ ] No new telemetry, analytics, or crash-reporting network call was added without the disclosure AGENTS.md requires
