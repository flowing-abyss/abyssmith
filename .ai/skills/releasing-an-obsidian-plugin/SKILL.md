---
name: releasing-an-obsidian-plugin
description: Cuts a release for this Obsidian plugin — bumps the version, verifies it end-to-end against real Obsidian, tags, pushes, and confirms the release actually came out clean on GitHub. Use when the user asks to release, publish, ship, or cut a new version of the plugin.
---

# Releasing an Obsidian Plugin

## The one command

```bash
pnpm run release patch   # or: minor / major
```

**Confirm with the user before running this.** It pushes a commit and a tag to the remote and (via `.github/workflows/release.yml`) creates a draft GitHub release — a one-way action, not a local dry run. (It's a draft — nothing is public until it's manually published; see "What's still manual" below.)

## What it does, in order

1. **`preversion`** — runs `pnpm run verify` (format, lint, types, arch, dead code, coverage, build, artifact checks including README/LICENSE presence) and then `pnpm run test:e2e` against real Obsidian, on whatever OS this machine is. Aborts here, untouched, if anything fails — no partial release state.
2. **`version`** — bumps `manifest.json`'s `version`, syncs `versions.json` (via `version-bump.mjs`), stages both.
3. pnpm's own version step commits (`"<new-version>"`) and tags **without a leading `v`** (`--tag-version-prefix ''`) — the tag must equal `manifest.json`'s `version` exactly; this is what `release.yml` and Obsidian's community-plugin submission process both expect.
4. **`postversion`** — `git push --follow-tags`, which triggers three separate GitHub Actions workflows on the same push: `ci.yml` (fast gate, redundant with what `preversion` already ran), `e2e.yml` (the cross-platform proof — desktop on Ubuntu/Windows/macOS **and** real Android — that `preversion`'s local `test:e2e` alone can't give you, since that only covers this one machine's OS), and `release.yml` (build, re-verify, generate a changelog from commit messages, open a **draft** GitHub release with `main.js`/`manifest.json`/`styles.css` attached).

## The command finishing is not the release finishing — verify on GitHub

`pnpm run release` returning success only means the **local** steps and the push worked. The actual release isn't real until the CI it triggered has finished and produced a correct result. Do not tell the user the release shipped until you've checked this.

**First, record exactly which commit and tag this release pushed** — every check below filters on these, not on "whatever the latest run happens to be" (a concurrent push, a re-run, or stale cache could otherwise point you at the wrong run):

```bash
release_sha=$(git rev-parse HEAD)
release_tag=$(git describe --tags --exact-match HEAD)
```

```powershell
$release_sha = git rev-parse HEAD
$release_tag = git describe --tags --exact-match HEAD
```

**Then, for each workflow, find the run that matches `$release_sha` — never `--limit=1` alone**, which can return someone else's concurrent run or a stale one:

```bash
# Works the same in bash or PowerShell — gh's own JSON/jq output, no xargs required.
run_id=$(gh run list --workflow=e2e.yml --json databaseId,headSha \
  --jq ".[] | select(.headSha == \"$release_sha\") | .databaseId" | head -n1)
gh run watch "$run_id" --exit-status
```

Repeat for `release.yml` (the build itself). Do the same three steps for both:

1. Get the run ID for the exact commit (`select(.headSha == "$release_sha")` — swap `.headSha` for the equivalent field name if a future `gh` version renames it).
2. Pass that ID to `gh run watch <id> --exit-status`.
3. Confirm the release exists at the exact tag, with a real changelog body — not an empty one (a broken changelog-builder step still exits 0):

```bash
gh release view "$release_tag" --json isDraft,body,name
```

If either workflow's conclusion isn't `success`, no run matches `$release_sha` (the push may not have triggered CI yet — wait and re-check, don't assume), or the release body is empty/missing, **stop and report the specific failure** — don't retry `pnpm run release` blindly (the tag already exists; a second run will fail on `--allow-same-version` or collide with the existing tag). Diagnose from the failed run's logs (`gh run view <id> --log-failed`) and fix forward.

## What's still manual

- Open the draft release on GitHub, skim the changelog you just confirmed is real, publish it.
- Obsidian now runs an automated review on every submitted version (security + code-quality scan, results in minutes) — see https://obsidian.md/blog/future-of-plugins/. Before a first submission, or if you want a pre-check beyond what this repo's own `eslint-plugin-obsidianmd` rules already catch, use the developer dashboard's own preview-scan feature on the pushed tag (https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins) — it's the same scanner that gates review, and nothing local can fully replicate it.
- First release only: submit the plugin to the community catalog per https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin.

## If `preversion` fails

Nothing was tagged or pushed — fix the failure, rerun `pnpm run release <bump>`. Don't hand-bump `manifest.json`/`versions.json` to route around a failure; that's exactly the drift `release-check.mjs` and this whole chain exist to catch.
