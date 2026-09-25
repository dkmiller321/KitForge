# VERIFICATION.md

Claude Code appends one section per stage here: the stage number, every command run with its pass/fail counts, each scenario walked through the `playwright-headless` MCP server as `E2E-xx: pass | fail — note`, and anything surprising. Final acceptance ends the file with totals, skipped tests and reasons, known issues, and the exact commands to run KitForge, link the CLI and install the hook.

## Stage 0 — Skeleton (2026-09-25)

Commands:

- `npx tsc --noEmit` (`npm run typecheck`): clean.
- `npm test` (Vitest): 23 passed, 0 failed.
- `npx playwright test --list`: 31 tests in 7 files (E2E-00 … E2E-30; the 4 @smoke specs are excluded unless `RUN_SMOKE=1`).
- `npx playwright test --retries=0 --timeout=30000`: 8 passed, 23 failed.
  - Passed: E2E-00, plus E2E-01–03 and E2E-06–09, because the import route, the library page and the CLI `pull`/`list`/`hook install` commands were built with the scaffold.
  - Failed only on missing features: the kit detail page (E2E-04/05), `/api/runs` (E2E-10–13 and everything that depends on a reported run).

MCP check (`playwright-headless`, dev server in mock mode on `.data/mcp.db`):

- Navigated to `http://127.0.0.1:4317/`. The snapshot shows the header (Library, Inbox), heading "Library", the "Import kit" button and "No kits yet". The MCP server is connected and working.
- E2E-00: pass. `/api/health` returned `{"ok":true,"llmMode":"mock"}`, `/api/test/reset` returned `{"ok":true}`, and the empty state is visible.

Surprises:

- TypeScript 6 flags `import "./globals.css"` as an unresolved side-effect import; fixed with `src/types/css.d.ts`.
- On Windows `os.homedir()` ignores `HOME`; the harness also sets `USERPROFILE` (see DECISIONS #1).

## Stage 1 — Library and viewer (2026-09-25)

Commands:

- `npm run typecheck`: clean. `npm test`: 23 passed.
- `npx playwright test --grep "@stage[0-2]"`: 9 passed, 0 failed (E2E-00 … E2E-08).

MCP walkthrough (`playwright-headless`, `npm run dev` in mock mode on `.data/mcp.db`, reset through `/api/test/reset`, fixture zips built with `zipFolder`):

- E2E-01: pass. The card shows `debug-kit`, `v1.0.0`, `0 runs`, success `—`; `/api/kits/debug-kit` has one version, 1.0.0, `isCurrent: true`, `changelogMd: "- Imported"`.
- E2E-02: pass. The folder path `…\e2e\fixtures\feature-kit` adds `new-feature-kit v1.0.0`; cards are ordered `debug-kit`, `new-feature-kit`. After a reset, `debug-kit-nested.zip` imports with files `SKILL.md` and `references/checklist.md` (the top-level folder is stripped).
- E2E-03: pass. The invalid zip shows `import-error` "No SKILL.md found" and `/api/kits` = `[]`. A duplicate import shows "A kit named debug-kit already exists." and the kit still has one version.
- E2E-04: pass. `/kits/debug-kit` shows title `debug-kit`, current `1.0.0`, `kit pull debug-kit@1.0.0`, two file-tree items, and SKILL.md rendered with an H1 "Debug Kit" and rule 3. Clicking checklist.md shows "Failing test written".
- E2E-05: pass. After a reload the content persists. The versions tab has one row `1.0.0` with `data-current="true"` and one changelog entry "Imported"; PUT, PATCH and DELETE on `/api/kits/debug-kit/versions/1.0.0` each return 405.

Surprises: the browser console logs the expected 400/409/405 responses as errors. They are not app errors.

## Stage 2 — CLI install (2026-09-25)

Commands:

- `npx playwright test --grep "@stage[0-2]"`: 9 passed, 0 failed.

MCP / shell walkthrough (CLI run from Git Bash with `HOME` and `USERPROFILE` set to a fresh `mktemp -d`, against the same mock server):

- E2E-06: pass. `kit pull debug-kit` prints `Installed debug-kit@1.0.0 to <home>\.claude\skills\debug-kit`, exit 0. `cmp` shows SKILL.md and references/checklist.md are byte-identical to the fixtures, and the `.kitforge.json` hash equals `contentHash` from `/api/kits/debug-kit`.
- E2E-07: pass. `pull nope` prints "Kit not found: nope" (exit 1); `pull debug-kit@9.9.9` prints "Version not found: debug-kit@9.9.9" (exit 1); a pre-existing `old.md` is removed by the next pull.
- E2E-08: pass. An empty home prints "No kits installed" (exit 0); after the pull it prints `debug-kit 1.0.0 (latest 1.0.0)`.

Stage 2 needed no UI; the `pull-command` text on the kit page was checked in E2E-04.

## Stage 3 — Run capture (2026-09-25)

Commands:

- `npm run typecheck`: clean. `npx eslint src`: clean. `npm test`: 23 passed.
- `npx playwright test --grep "@stage[0-3]"`: 14 passed, 0 failed.

Walkthrough (CLI in Git Bash with a fresh temp `HOME`/`USERPROFILE`; UI through `playwright-headless`; server in mock mode on `.data/mcp.db`, reset first):

- E2E-09: pass. Starting from `{"theme":"dark"}`, `kit hook install` twice printed `SessionEnd hook installed in <home>\.claude\settings.json` (exit 0) both times. The file keeps `theme: dark` and has exactly one `SessionEnd` entry with one `{type: command, command: "kit report"}`.
- E2E-10: pass. `report partial` (sess-001, hook JSON on stdin) printed `Reported 1 run(s)`. `/api/runs?kit=debug-kit` returns one run with sessionId sess-001, projectPath /tmp/proj-a, outcome partial, correctionCount 2, tests 3/1, and no transcript field. `/api/feedback?status=new` returns the two X1 corrections with exact texts and quotes. MCP: the Runs tab shows run-row(s) with `partial`, `2`, `1.0.0`, `3 passed, 1 failed`; the library card shows 0% success.
- E2E-11: pass. Repeating sess-001 printed `Reported 0 run(s)`; the no-kit transcript printed `No kits used`; there is still 1 run.
- E2E-12: pass. With `KITFORGE_URL=http://127.0.0.1:59999`, the report printed `Queued 1 report(s)` in about 500 ms and the outbox held one `.json`. The next report (no-kit, normal URL) printed `Flushed 1 queued report(s)` / `No kits used`, the outbox is empty and the queued run exists. This walk used session sess-005 for the queued report because sess-001 already existed on the shared walkthrough DB; the spec uses a fresh DB.
- E2E-13: pass. The `MOCK:extract-fail` transcript as sess-010 printed `Queued 1 report(s)`; no sess-010 run or feedback was written (the server returned 502 `extraction_failed`), and the report waits in the outbox.

Surprises: none in the app. My first walkthrough helper mangled Windows paths in the stdin JSON (a shell quoting bug); rerunning with `cygpath -m` fixed it.

## Stage 4 — Inbox (2026-09-25)

Commands:

- `npm run typecheck`: clean. `npx eslint src e2e`: clean. `npm test`: 23 passed.
- `npx playwright test --grep "@stage[0-4]"`: first run 17 passed, 1 failed (E2E-15). After the fix below: 18 passed, 0 failed (run twice).

Walkthrough (MCP `playwright-headless` + CLI with a temp HOME, mock server on `.data/mcp.db`):

- E2E-14: pass. After report partial, `inbox-count` = 2 and New lists #1 and #2 with kit `debug-kit` and the X1 quotes. Accept #1 and dismiss #2 leave "Nothing to triage" and the badge disappears. After a reload, Accepted shows only #1 and the kit page shows `1 accepted`.
- E2E-15: pass. With debug-kit and new-feature-kit reported, filtering to `new-feature-kit` shows only "Edited the module without reading it first" (URL `?tab=new&kit=new-feature-kit`). Tag `testing` typed + Enter on #1 is still there after a reload.
- E2E-16: pass. `kit note "Good root-cause analysis" --rating 4` printed `Added note to run #1` and the inbox gained a `note` item rated 4. After overriding the outcome to `success` and reloading, the run shows `success` and the library card shows `100%`. On an empty DB, `kit note x` prints `No runs yet` (exit 1).
- E2E-17: pass. `j` focused the first item (#2, `data-focused="true"`); `a` accepted it; `j`,`d` dismissed the other; New shows "Nothing to triage" (API: #2 accepted, #1 dismissed).

Bugs found and fixed:

1. **E2E-15 (spec):** the tag chip was shown before the PATCH finished, so an immediate reload could lose the tag. The chip is now added only after the save succeeds.
2. **E2E-16 (MCP walkthrough only; the spec passed):** changing `run-outcome-select` and navigating away within about 300 ms aborted the PATCH, so the override was lost. Triage and outcome mutations now use `fetch(..., { keepalive: true })`, so the save completes even when the page unloads. Re-checked: the value persists; the next render can show the old value if it lands before the save commits, and it is correct on the following render.

## Stage 5 — Improve and publish (2026-09-25)

Commands:

- `npm run typecheck`: clean. `npx eslint src e2e`: clean. `npm test`: 23 passed.
- `npx playwright test --grep "@stage5" --retries=0`: first run 3 passed, 2 failed (E2E-19, E2E-20 timed out on a disabled Improve button; cause below).
- After the fix: `npx playwright test --grep "@stage[45]" --retries=0`: 9 passed. `npx playwright test --grep "@stage[0-5]"`: 23 passed, 0 failed.

MCP walkthrough (`playwright-headless` + CLI with a temp HOME, mock server on `.data/mcp.db`):

- **E2E-19 ★ core loop: pass, every step.**
  1. Import, pull, report partial sess-001: `Reported 1 run(s)`.
  2. Accepted #1 and #2 in the inbox UI. The kit page shows `2 accepted`. Improve → Generate went to `/kits/debug-kit/proposals/1` with two hunks (SKILL.md: `-1. Reproduce … before changing code.` / `+… Never write the fix first.`, rationale linked to #1; checklist: `+- [ ] Only the failing test run while iterating`, linked to #2). Publish stayed disabled after one accept and was enabled after both; bump defaulted to `minor`. Published.
  3. Redirected to `/kits/debug-kit`: `kit-current-version` 1.1.0, `pull-command` `kit pull debug-kit@1.1.0`, and the viewer contains "Never write the fix first."
  4. Versions: 1.1.0 (`data-current="true"`) has two changelog entries linking #1 and #2; 1.0.0 still has "Imported".
  5. Inbox → Resolved: #1 and #2 both read "Resolved in 1.1.0".
  6. `/api/kits/debug-kit/files?version=1.0.0` is byte-identical to the fixtures (checked in node), and its contentHash is unchanged (`ec0f1d…`).
  7. `kit pull debug-kit` prints `Installed debug-kit@1.1.0 to …`; SKILL.md on disk contains the new rule; `.kitforge.json` version is 1.1.0; `kit list` prints `debug-kit 1.1.0 (latest 1.1.0)`.
  8. The success transcript as sess-002 printed `Reported 1 run(s)`; run #2 shows version 1.1.0, outcome success.
  9. Metrics: 1.0.0 → 1 / 0% / 2.0; 1.1.0 → 1 / 100% / 0.0.
- E2E-18: pass. Hunk files, removed and added text, rationale, feedback links (#1 on SKILL.md, #2 on the checklist) and publish gating were all observed in step 2 above; `proposal-loading` was seen 100 ms after submit (in the E2E-22 walk).
- E2E-20: pass. Accept SKILL.md, reject the checklist, bump `patch`, publish: current is 1.0.1; the 1.0.1 checklist equals the fixture; #1 is resolved in 1.0.1; #2 is still accepted; `1 accepted`. The earlier bad-hunk draft became `discarded` (one active draft per kit).
- E2E-21: pass. `MOCK:bad-hunk` gives one hunk and "1 suggested change couldn't be applied and was dropped".
- E2E-22: pass. `MOCK:proposal-fail` shows `proposal-loading`, then "Couldn't generate a proposal. Nothing was changed."; URL stays `/kits/debug-kit`; no drafts; current 1.0.0; #1 and #2 still accepted.

Bug found and fixed: the inbox removed an item before its PATCH had committed (optimistic UI), so an immediate navigation could render a stale state (the Improve button disabled with 0 accepted). Accept, dismiss and merge now remove items only after the server confirms the change.
