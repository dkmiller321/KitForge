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
