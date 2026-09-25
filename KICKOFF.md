# KICKOFF.md — paste the prompt below into Claude Code

Before you start, put these files in an empty repo: `CLAUDE.md`, `KICKOFF.md`, `.env.example` and `docs/`. Then `cp .env.example .env`. Start Claude Code in the repo root and run `/mcp` to confirm the `playwright-headless` server is connected.

---

```
You are building KitForge from an empty repo.

Read, in order: docs/PRD.md, docs/E2E_TESTS.md, CLAUDE.md. Follow CLAUDE.md's rules
for the whole build.

Phase 1: Plan (then continue without waiting)
- Summarise the build in under 20 lines: stages, the mock LLM design (extractRun
  scripts X0–X5, proposeImprovement scripts P1–P4), how the CLI is tested with a
  temp HOME, and how you will verify each stage with both @playwright/test and the
  `playwright-headless` MCP server.
- List any contradictions or gaps you found in the docs. If any block you, stop and
  ask. Otherwise record your assumptions in docs/DECISIONS.md and continue.

Phase 2: Tests first (stage 0)
- Scaffold stage 0: Next.js + TypeScript strict, Tailwind, shadcn/ui, Drizzle +
  better-sqlite3 with migrations, zod env, GET /api/health, POST /api/test/reset,
  the KitLlm interface with the mock and the Anthropic client, the commander CLI
  skeleton (`kit --help`), and the Playwright + Vitest configs.
- Create every fixture in E2E_TESTS.md §1.4 exactly as written, plus the helpers
  (cli.ts, zip.ts, transcript.ts).
- Write EVERY scenario in docs/E2E_TESTS.md as a spec in e2e/, tagged by stage,
  plus the @smoke specs. Use the data-testid contract exactly.
- Run `npm run test:e2e -- --list` to prove they all compile, then run the suite.
  E2E-00 must pass; everything else is expected to fail at this point.
- Confirm the `playwright-headless` MCP server works: navigate to the running app
  and take a snapshot. Record the result in docs/VERIFICATION.md. Commit.

Phase 3: Build stages 1–6
- For each stage, follow the Workflow in CLAUDE.md: implement, unit tests, that
  stage's and all earlier stages' E2E specs green, then a `playwright-headless` MCP
  walkthrough of that stage's scenarios, then VERIFICATION.md, then commit.
- E2E-19 (the core loop) is the most important test. Stage 5 is not done until it
  passes both as a spec and as an MCP walkthrough.
- Never weaken an assertion to make it pass. Propose spec changes instead.

Phase 4: Final acceptance
- Run the Final acceptance steps in CLAUDE.md.
- Finish with a short report: pass/fail totals, anything skipped and why, known
  issues, and the exact commands I need to run KitForge myself, install the CLI
  on my PATH, install the SessionEnd hook, and import my existing kits.
```

---

## Useful follow-up prompts

- **Resume after a break:** `Read CLAUDE.md and docs/VERIFICATION.md, find the last completed stage, and continue from the next one.`
- **Re-verify:** `Reset the DB and walk E2E-19 and E2E-27 through the playwright-headless MCP server, running CLI steps with a temp HOME; report each step.`
- **Real model:** `Set KITFORGE_LLM_MODE=real, then run RUN_SMOKE=1 npm run test:e2e -- --grep @smoke and report results.`
- **Real transcript check:** `Set KITFORGE_SMOKE_TRANSCRIPT to <path of one of my ~/.claude/projects/*.jsonl that used a kit> and run SMOKE-4.`
