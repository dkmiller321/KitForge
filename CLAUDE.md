# CLAUDE.md — KitForge

Read these first, in order:

1. `docs/PRD.md`: what we are building and why. It is the source of truth for scope.
2. `docs/E2E_TESTS.md`: the acceptance contract. A feature exists when its scenarios pass.
3. This file: how to work.

If this file and the PRD disagree, the PRD wins. If the PRD and E2E_TESTS.md disagree, stop and ask.

## Stack (fixed)

| Layer | Choice |
|---|---|
| Runtime | Node 22 LTS, npm |
| App | Next.js 15 (App Router), TypeScript `strict: true` |
| UI | Tailwind CSS + shadcn/ui |
| Markdown | `react-markdown` + `remark-gfm` |
| Diff | `diff` (jsdiff) to build and apply hunks; `react-diff-view` to display them |
| Database | SQLite via `better-sqlite3` + Drizzle ORM and drizzle-kit migrations |
| Validation | zod (env, API inputs, LLM outputs) |
| Zip | `adm-zip` (import in the app; fixture zips in tests) |
| CLI | `commander`, run with `tsx` in dev; `bin/kit` entry for `npm link` |
| LLM | OpenRouter chat completions via `fetch` (no SDK); key in `OPENROUTER_API_KEY` |
| Tests | Vitest (unit/API), `@playwright/test` (E2E) |

These packages are pre-approved. **Ask before adding any other runtime dependency.** Dev-only tooling (types, lint config) is fine.

## Hard rules

- **Tests first.** Write every E2E spec in `docs/E2E_TESTS.md` before building features. Specs may fail; they may never be weakened later to pass. If a scenario is wrong, say so and propose the change. Never silently edit an assertion.
- **Nothing is done until it has run.** For every claim that something works, state the command you ran and what you observed.
- **Mock LLM for tests.** With `KITFORGE_LLM_MODE=mock`, the app uses the scripted mock in E2E_TESTS.md §1.5, behind the same `KitLlm` interface as the real client. No test except `@smoke` may call the Anthropic API.
- **Selectors are a contract.** Use the `data-testid` values in E2E_TESTS.md §1.7 exactly. Don't rename them.
- **Transcripts are never stored.** Not in the DB, not in logs, not in the outbox beyond the queued request body. Only extracted text and quotes (under 300 characters) are persisted. `GET /api/runs` must not expose any transcript field.
- **Versions are immutable.** No code path updates or deletes a `kit_versions` or `version_files` row. New content always means a new version.
- **The LLM never writes diffs.** It returns find/replace edits; the server validates each edit (find occurs exactly once) and renders it as a hunk.
- **`kit report` never breaks a Claude Code session.** It always exits 0, times out after `KITFORGE_REPORT_TIMEOUT_MS`, and queues to `~/.kitforge/outbox/` on any failure.
- **The CLI uses `os.homedir()` for every path.** Tests depend on it.
- **Licences:** LangSmith, Braintrust, Linear and GitHub are functionality references only. Copy no code from them.
- **Respect the non-goals:** no auth, accounts, teams, sharing, marketplace, auto-publish, or non-Claude-Code agents.
- **No TODOs or stubs** in committed code. Implement it, or record it as out of scope in `docs/DECISIONS.md`.
- **Secrets stay server-side.** `ANTHROPIC_API_KEY` never reaches the client bundle; the server binds to `KITFORGE_HOST` (127.0.0.1).

## Conventions

- Layout: `src/app/` (routes and API handlers), `src/components/`, `src/lib/` (server logic), `src/lib/llm/` (`index.ts`, `anthropic.ts`, `mock.ts`, `schemas.ts`), `src/lib/kits/` (import, hash, semver, hunks), `src/cli/` (commander entry and one file per command), `src/db/` (schema, migrations), `e2e/` (specs, `helpers/`, `fixtures/`).
- Env is read once in `src/lib/env.ts` with zod; nothing else reads `process.env`. The CLI has its own small `src/cli/env.ts` (only `KITFORGE_URL`, `KITFORGE_REPORT_TIMEOUT_MS`).
- Core logic is pure and unit-tested: `detectKits`, `trimTranscript`, `contentHash`, `bumpSemver`, `editsToHunks`, `applyHunks`, `aggregateMetrics`, `mergeHookSettings`. Route handlers and CLI commands only wire these together.
- The real LLM client (`src/lib/llm/openrouter.ts`) offers one tool per call, whose parameters are the zod schema, with `tool_choice: "auto"` and a system prompt that requires calling it (forced tool choice is rejected by some current models); a JSON text answer is accepted as a fallback. Its output passes the same zod validation as the mock.
- DB writes that belong together (publish: new version + files + changelog + feedback resolution + proposal status) run in one SQLite transaction.
- Errors: one handler per route returning `{ error: <code> }` with the right status. No blanket try/catch or retry wrappers, except the CLI's report path, which is designed to swallow failures.
- CLI output lines are part of the contract (E2E_TESTS.md). When a report both sends and queues, print both lines: `Reported N run(s)` then `Queued M report(s)`.
- Commit after each stage with the message `stage N: <summary>`.

## Workflow

Work through the stages in `docs/PRD.md` → Milestones, in order, without waiting for confirmation between stages unless you are blocked.

For each stage:

1. Implement the stage.
2. Run `npm run typecheck && npm test`.
3. Run `npm run test:e2e -- --grep "@stage[0-N]"` (this stage and every earlier stage). All must pass.
4. **Verify with the `playwright-headless` MCP server**: start the app in mock mode and walk this stage's scenarios as in E2E_TESTS.md §4, running CLI steps from the shell with a temp `HOME`.
5. Append a section to `docs/VERIFICATION.md`: the stage, commands run with pass/fail counts, each MCP-walked scenario ID with its result, and anything surprising.
6. Commit.

Stop and ask when:

- a change would alter the PRD's scope or a test's assertion,
- a dependency outside the approved list seems necessary,
- the same failure survives three genuine fix attempts.

## Final acceptance

1. `npm run build && npm start` with `KITFORGE_LLM_MODE=mock` and a fresh `KITFORGE_DB_PATH`; wait for `/api/health` to return 200.
2. Run `BASE_URL=http://127.0.0.1:4317 npm run test:e2e` against it. All non-smoke tests must pass.
3. Walk every P0 scenario, and E2E-19 in full, through the `playwright-headless` MCP server against that server.
4. If `ANTHROPIC_API_KEY` and `KITFORGE_MODEL` are set, restart with `KITFORGE_LLM_MODE=real` and run `RUN_SMOKE=1 npm run test:e2e -- --grep @smoke`.
5. Write the final summary in `docs/VERIFICATION.md`: totals, skipped tests with reasons, known issues, and the exact setup commands for real use (`npm link`, `kit hook install`, importing the user's three kits).
