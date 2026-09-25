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
