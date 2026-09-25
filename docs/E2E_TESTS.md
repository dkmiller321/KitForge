# E2E_TESTS.md — Acceptance contract

Every scenario below becomes a `@playwright/test` spec in `e2e/` **before** the feature is built. A stage is done when its scenarios, and every earlier stage's scenarios, pass. After that, walk them again through the `playwright-headless` MCP server (section 4).

KitForge has two surfaces: the web UI (driven by Playwright) and the `kit` CLI (driven from specs with `child_process`). Both are covered here.

## 1. Test harness

### 1.1 Running

| Command | What it does |
|---|---|
| `npm run test:e2e` | All specs except `@smoke`. Playwright's `webServer` starts `npm run dev` with `KITFORGE_LLM_MODE=mock`, `KITFORGE_PORT=4317`, `KITFORGE_DB_PATH=.data/e2e.db`, unless `BASE_URL` is set. |
| `npm run test:e2e -- --grep @stage3` | One stage's scenarios. |
| `BASE_URL=http://127.0.0.1:4317 npm run test:e2e` | Against an already-running app (e.g. `npm start`). |
| `RUN_SMOKE=1 KITFORGE_LLM_MODE=real npm run test:e2e -- --grep @smoke` | Real-Claude smoke suite. Needs `ANTHROPIC_API_KEY` and `KITFORGE_MODEL`. |
| `npm test` | Vitest unit + API tests. |

Playwright config: Chromium only, headless, `workers: 1` (one shared SQLite DB), `retries: 1`, trace `on-first-retry`, `baseURL` from `BASE_URL` or `http://127.0.0.1:4317`. Tags go in test titles: `test('E2E-10 @stage3 report via hook stdin', …)`.

### 1.2 Database reset

When `KITFORGE_LLM_MODE=mock`, `POST /api/test/reset` deletes every row from all tables (kits, kit_versions, version_files, runs, feedback, proposals, proposal_hunks) and resets autoincrement counters so feedback IDs start at 1. It returns **404 when the mode is not `mock`**. Every spec calls it in `beforeEach`.

### 1.3 CLI harness

Specs drive the CLI through `e2e/helpers/cli.ts`:

```ts
runKit(args: string[], opts: { home: string; stdin?: string; env?: Record<string,string> })
  → Promise<{ code: number; stdout: string; stderr: string; ms: number }>
```

It spawns `npx tsx src/cli/index.ts ...args` with `HOME=<opts.home>`, `KITFORGE_URL=http://127.0.0.1:4317` (overridable via `opts.env`), and pipes `stdin` if given. `tmpHome()` creates a fresh directory under `os.tmpdir()` per test. **The CLI must derive every path from `os.homedir()`** (`~/.claude/skills`, `~/.claude/settings.json`, `~/.kitforge/outbox`) so tests never touch the real home directory.

`kit report` accepts the Claude Code `SessionEnd` hook payload on stdin:

```json
{ "session_id": "sess-001", "transcript_path": "/abs/path.jsonl", "cwd": "/tmp/proj-a", "hook_event_name": "SessionEnd", "reason": "exit" }
```

It also accepts the same fields as flags (`--session-id`, `--transcript`, `--cwd`) for manual use. Flags win over stdin.

### 1.4 Fixtures (create these in stage 0, exactly as written)

**`e2e/fixtures/debug-kit/SKILL.md`**

```markdown
---
name: debug-kit
description: Systematic debugging workflow for Claude Code.
---

# Debug Kit

1. Reproduce the bug with a failing test before changing code.
2. Read the full error and stack trace.
3. Fix the root cause, not the symptom.
```

**`e2e/fixtures/debug-kit/references/checklist.md`**

```markdown
# Checklist

- [ ] Failing test written
```

**`e2e/fixtures/feature-kit/SKILL.md`**

```markdown
---
name: new-feature-kit
description: Add a feature to an existing app.
---

# New Feature Kit

1. Read the existing module before editing it.
2. Match the existing code style.
```

**`e2e/fixtures/invalid-kit/README.md`**: `# Not a kit` (no SKILL.md anywhere).

Zips are built at test time by `e2e/helpers/zip.ts` (`zipFolder(dir): Buffer`, using `adm-zip` as a devDependency): `debug-kit.zip` (files at the zip root), `debug-kit-nested.zip` (everything inside one top-level `debug-kit/` folder), `invalid-kit.zip`.

**Transcripts** are JSONL in the Claude Code format: one object per line with `type` (`user` | `assistant`), `timestamp` (ISO) and `message`. `e2e/helpers/transcript.ts` exports `writeTranscript(dir, name, lines)` and these builders. Every kit transcript contains a `Read` tool call on the skill file:

```jsonl
{"type":"user","timestamp":"2026-09-20T10:00:00.000Z","message":{"role":"user","content":"<MARKER> The login test is failing, use the debug kit."}}
{"type":"assistant","timestamp":"2026-09-20T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu_1","name":"Read","input":{"file_path":"/Users/someone/.claude/skills/debug-kit/SKILL.md"}}]}}
{"type":"user","timestamp":"2026-09-20T10:00:06.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_1","content":"# Debug Kit ..."}]}}
{"type":"assistant","timestamp":"2026-09-20T10:01:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"I'll patch the session check."}]}}
{"type":"user","timestamp":"2026-09-20T10:01:30.000Z","message":{"role":"user","content":"Stop — write the failing test first, then fix it."}}
{"type":"assistant","timestamp":"2026-09-20T10:20:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Done. 3 passed, 1 failed."}]}}
```

| Fixture | `<MARKER>` | Skill read | Notes |
|---|---|---|---|
| `transcript-debug-partial.jsonl` | `MOCK:debug-partial` | `debug-kit` | As above |
| `transcript-debug-success.jsonl` | `MOCK:debug-success` | `debug-kit` | Same shape, last text `Done. 4 passed, 0 failed.` |
| `transcript-debug-dup.jsonl` | `MOCK:debug-dup` | `debug-kit` | Same shape |
| `transcript-feature.jsonl` | `MOCK:feature-partial` | `new-feature-kit` | Read path ends `/.claude/skills/new-feature-kit/SKILL.md` |
| `transcript-no-kit.jsonl` | `MOCK:debug-partial` | none | No `Read` of any `SKILL.md` |
| `transcript-real-smoke.jsonl` | none | `debug-kit` | Used only by `@smoke`; user says `No — write the failing test first, then fix it.` |

Kit detection (pure function `detectKits(lines): string[]`, unit-tested): a kit name is detected when an `assistant` `tool_use` named `Read` has `input.file_path` ending in `/.claude/skills/<name>/SKILL.md`. Only names that also have `~/.claude/skills/<name>/.kitforge.json` in the current HOME are reported. Session start and end times come from the first and last `timestamp`.

Trimming (pure function `trimTranscript(lines): string`, unit-tested): keep user text, assistant text and tool_use name + input; replace each `tool_result` body longer than 2,000 characters with `[truncated N chars]`; cap the whole string at 600,000 characters by dropping the middle and inserting `[... trimmed ...]`.

### 1.5 The mock LLM

`src/lib/llm/index.ts` exports `getLlm(): KitLlm` with `extractRun(transcript: string)` and `proposeImprovement(input: { files, feedback, instruction? })`. When `KITFORGE_LLM_MODE=mock` it returns `src/lib/llm/mock.ts`, which sits **behind the same interface**: the real route handlers, zod validation of the LLM output, find/replace validation, diff rendering and DB writes all run unchanged. The mock never talks to the network.

Mock calls wait 300 ms before resolving so loading states are observable (`proposal-loading`).

**`extractRun` matching:** first `MOCK:<name>` marker found in the transcript text.

| Script | Marker | Exact output |
|---|---|---|
| X1 debug-partial | `MOCK:debug-partial` | `{ outcome: "partial", corrections: [ { text: "Wrote the fix before writing a failing test", quote: "Stop — write the failing test first, then fix it." }, { text: "Ran the full test suite instead of the single failing test", quote: "Only run the failing test, the full suite takes 10 minutes." } ], tests: { passed: 3, failed: 1 } }` |
| X2 debug-success | `MOCK:debug-success` | `{ outcome: "success", corrections: [], tests: { passed: 4, failed: 0 } }` |
| X3 debug-dup | `MOCK:debug-dup` | `{ outcome: "partial", corrections: [ { text: "Wrote the fix before the failing test again", quote: "Again: test first, then the fix." } ], tests: { passed: 2, failed: 1 } }` |
| X4 feature-partial | `MOCK:feature-partial` | `{ outcome: "partial", corrections: [ { text: "Edited the module without reading it first", quote: "Read the whole file before you touch it." } ], tests: null }` |
| X5 extract-fail | `MOCK:extract-fail` | Throws. `POST /api/runs` returns 502 `{ error: "extraction_failed" }` and writes nothing. |
| X0 default | no marker | `{ outcome: "success", corrections: [], tests: null }` |

**`proposeImprovement` matching:** on `instruction` (lower-cased, `contains`), else default. Feedback is passed sorted by id ascending; below, `F[0]`, `F[1]` are those ids.

| Script | Instruction contains | Exact edits returned |
|---|---|---|
| P1 default | (none / no match) | 1) file `SKILL.md`, find `1. Reproduce the bug with a failing test before changing code.`, replace `1. Reproduce the bug with a failing test before changing any code. Never write the fix first.`, rationale `Make test-first explicit so the fix is never written first.`, feedback_ids `[F[0]]`. 2) file `references/checklist.md`, find `- [ ] Failing test written`, replace `- [ ] Failing test written\n- [ ] Only the failing test run while iterating`, rationale `Keep iteration on the single failing test.`, feedback_ids `[F[1] ?? F[0]]`. |
| P2 shorter | `shorter` | 1) file `SKILL.md`, find `3. Fix the root cause, not the symptom.`, replace `3. Fix the root cause.`, rationale `Shorten rule 3.`, feedback_ids `[F[0]]`. |
| P3 bad-hunk | `mock:bad-hunk` | P1's edit 1, plus file `SKILL.md`, find `THIS LINE DOES NOT EXIST`, replace `x`, rationale `Invalid`, feedback_ids `[F[0]]`. The second must be dropped (§ PRD rule). |
| P4 fail | `mock:proposal-fail` | Throws. `POST /api/kits/:name/proposals` returns 502 `{ error: "proposal_failed" }` and writes nothing. |

### 1.6 Inspection API (read-only, used by specs)

| Endpoint | Returns |
|---|---|
| `GET /api/kits` | `[{ name, title, currentVersion, runCount, successRate }]` sorted by name |
| `GET /api/kits/:name` | `{ name, currentVersion, versions: [{ semver, contentHash, changelogMd, createdAt, isCurrent }] }` newest first; 404 if unknown |
| `GET /api/kits/:name/files?version=` | `{ name, version, contentHash, files: [{ path, content }] }` |
| `GET /api/runs?kit=` | runs newest first: `{ id, sessionId, kitName, version, projectPath, outcome, correctionCount, testsPassed, testsFailed }` — **no transcript field of any kind** |
| `GET /api/feedback?kit=&status=` | `[{ id, runIds, kitName, kind, text, quote, rating, tags, status, mergedIntoId, resolvedInVersion }]` |
| `GET /api/proposals?kit=&status=` / `GET /api/proposals/:id` | proposal with `hunks[]`, `droppedCount`, `status`, `baseVersion` |
| `GET /api/kits/:name/metrics` | `[{ version, runs, successRate, correctionsPerRun }]` newest version first |

`contentHash` = sha256 hex over the version's files sorted by path, each as `path\n` + content + `\n`. The CLI writes the same value into `.kitforge.json`.

### 1.7 Selector contract (`data-testid`)

| testid | Element |
|---|---|
| `nav-library` / `nav-inbox` | Top nav links |
| `inbox-count` | Badge on `nav-inbox`: number of `new` items; hidden when 0 |
| `library-empty` | Empty state, text `No kits yet` |
| `import-button` | Opens import dialog |
| `import-file` | File input (zip) |
| `import-path` | Text input: absolute folder path on this machine |
| `import-submit` | Import |
| `import-error` | Error text in the dialog |
| `kit-card` | One per kit; `data-kit-name` |
| `kit-card-version` / `kit-card-runs` / `kit-card-success` | Card fields: `v1.0.0`, `1 run` / `3 runs`, `50%` or `—` |
| `kit-title` / `kit-current-version` | Kit detail header |
| `pull-command` | Text `kit pull <name>@<current>` |
| `tab-files` / `tab-versions` / `tab-runs` / `tab-metrics` | Kit detail tabs |
| `version-select` | Version dropdown on Files tab; options have `data-version` |
| `file-tree-item` | One per file; `data-path` |
| `file-viewer` | Rendered Markdown of the selected file |
| `version-row` | One per version; `data-version`, `data-current="true"` on current |
| `changelog-entry` | One per changelog line under a `version-row` |
| `changelog-feedback-link` | Link inside an entry; `data-feedback-id` |
| `set-current-button` | On each non-current `version-row` |
| `diff-from` / `diff-to` / `diff-show` / `version-diff` | Version diff controls and output |
| `run-row` | One per run; `data-run-id` |
| `run-outcome` / `run-corrections` / `run-version` / `run-tests` | Run fields; tests `3 passed, 1 failed` or `—` |
| `run-outcome-select` | Override select (`success` / `partial` / `failed`) |
| `metrics-row` | One per version; `data-version` |
| `metric-runs` / `metric-success` / `metric-corrections` | `1`, `50%` (`—` when 0 runs), `2.0` |
| `compare-link` / `compare-a` / `compare-b` | Compare page and its two columns |
| `improve-count` | Text `N accepted` |
| `improve-button` | Disabled when 0 accepted |
| `improve-instruction` / `improve-submit` | Dialog inputs |
| `proposal-loading` | Visible while generating |
| `proposal-error` | Error text, e.g. `Couldn't generate a proposal. Nothing was changed.` |
| `inbox-tab-new` / `inbox-tab-accepted` / `inbox-tab-resolved` | Inbox tabs |
| `inbox-filter-kit` | Kit filter select (`all` + kit names) |
| `inbox-empty` | Text `Nothing to triage` |
| `inbox-item` | One per item; `data-feedback-id`, `data-status`, `data-focused="true"` when keyboard-focused |
| `feedback-text` / `feedback-quote` / `feedback-kit` / `feedback-rating` / `feedback-runs` / `feedback-status` | Item fields; rating `4/5`; runs `2 runs`; status e.g. `Resolved in 1.1.0` |
| `feedback-accept` / `feedback-dismiss` | Triage actions |
| `feedback-tag-input` / `feedback-tag` | Tag entry (Enter adds) and each tag chip |
| `inbox-select` / `merge-button` | Per-item checkbox and merge action |
| `proposal-hunk` | One per hunk; `data-hunk-id`, `data-file`, `data-decision` |
| `hunk-removed` / `hunk-added` | Removed and added lines inside a hunk |
| `hunk-rationale` / `hunk-feedback-link` | Rationale and linked feedback (`data-feedback-id`) |
| `hunk-accept` / `hunk-reject` | Decision buttons |
| `hunk-edit` / `hunk-edit-input` / `hunk-edit-save` | Edit replacement text |
| `proposal-dropped` | Text `1 suggested change couldn't be applied and was dropped` (absent when 0) |
| `bump-select` | `patch` / `minor` (default) / `major` |
| `publish-button` | Disabled until every hunk is decided and at least one is accepted |
| `publish-error` | Error text |
| `regenerate-instruction` / `regenerate-button` | Regenerate controls |
| `edit-kit-button` / `edit-file-select` / `edit-textarea` / `edit-changelog` / `edit-save` | In-browser editing (K8) |
| `export-button` | "Download for Claude": zip of the current version with the reporting step (L7) |

## 2. Scenarios

Each scenario starts from a reset DB and a fresh `tmpHome()`. Shorthand:

- **Import debug-kit** = on `/`, click `import-button`, set `import-file` to `debug-kit.zip`, click `import-submit`.
- **Pull** = `runKit(['pull','debug-kit'], { home })`.
- **Report partial** = copy `transcript-debug-partial.jsonl` to `<home>/t1.jsonl`, run `runKit(['report'], { home, stdin: JSON.stringify({ session_id: 'sess-001', transcript_path: '<home>/t1.jsonl', cwd: '/tmp/proj-a', hook_event_name: 'SessionEnd', reason: 'exit' }) })`. Other transcripts use the same pattern with their own session id.
- **F1, F2** = the ids of the two X1 feedback items, in id order (F1 = "Wrote the fix before writing a failing test").

### Stage 0 — Skeleton

**E2E-00 @stage0 app and CLI boot.** `GET /api/health` returns 200 `{"ok":true,"llmMode":"mock"}`. `/` shows `library-empty` with `No kits yet` and `import-button`. `POST /api/test/reset` returns 200. `runKit(['--help'])` exits 0 and stdout contains `pull`, `list`, `hook`, `report` and `note`.

### Stage 1 — Library and viewer

**E2E-01 @stage1 import a zip (K1, K2, U1).** Import debug-kit. One `kit-card` with `data-kit-name="debug-kit"`; `kit-card-version` = `v1.0.0`; `kit-card-runs` = `0 runs`; `kit-card-success` = `—`. `GET /api/kits/debug-kit` has exactly one version `1.0.0`, `isCurrent: true`, `changelogMd` = `- Imported`.

**E2E-02 @stage1 import from folder path and nested zip (K1).** Enter the absolute path of `e2e/fixtures/feature-kit` in `import-path` and submit: a card `new-feature-kit` `v1.0.0` appears. Import `debug-kit-nested.zip`: a card `debug-kit` appears and `GET /api/kits/debug-kit/files` lists exactly `SKILL.md` and `references/checklist.md` (the top-level folder is stripped). Cards are ordered `debug-kit`, `new-feature-kit`.

**E2E-03 @stage1 invalid and duplicate imports are rejected (K1, Reliability).** Import `invalid-kit.zip`: `import-error` = `No SKILL.md found`, no card is added, `GET /api/kits` returns `[]`. Import debug-kit, then import it again: `import-error` = `A kit named debug-kit already exists.` and the kit still has exactly one version.

**E2E-04 @stage1 kit viewer (K3, U2).** Import debug-kit and click its card. URL is `/kits/debug-kit`. `kit-title` = `debug-kit`; `kit-current-version` = `1.0.0`; `pull-command` = `kit pull debug-kit@1.0.0`. Two `file-tree-item`s: `SKILL.md` and `references/checklist.md`. `SKILL.md` is selected by default; `file-viewer` has a heading `Debug Kit` and the text `Fix the root cause, not the symptom.` Click `references/checklist.md`: `file-viewer` contains `Failing test written`.

**E2E-05 @stage1 persistence and immutability (K4, K5).** Import debug-kit, open it, reload: the same file content shows. `tab-versions` shows one `version-row` `data-version="1.0.0"` `data-current="true"` with one `changelog-entry` `Imported`. `PUT`, `PATCH` and `DELETE` on `/api/kits/debug-kit/versions/1.0.0` each return 405.

### Stage 2 — CLI install

**E2E-06 @stage2 pull installs files and manifest (L1, U3).** Import debug-kit. Pull: exit 0; stdout = `Installed debug-kit@1.0.0 to <home>/.claude/skills/debug-kit`. `<home>/.claude/skills/debug-kit/SKILL.md` and `references/checklist.md` are byte-identical to the fixture. `.kitforge.json` parses to `{ name: "debug-kit", version: "1.0.0", hash }` where `hash` equals `contentHash` from `GET /api/kits/debug-kit`.

**E2E-07 @stage2 pull errors and clean install (L1).** `runKit(['pull','nope'])`: exit 1, stderr `Kit not found: nope`. `runKit(['pull','debug-kit@9.9.9'])` (after import): exit 1, stderr `Version not found: debug-kit@9.9.9`. Create `<home>/.claude/skills/debug-kit/old.md`, then pull: `old.md` no longer exists.

**E2E-08 @stage2 list (L2).** With an empty home, `runKit(['list'])` prints `No kits installed`, exit 0. After a pull, stdout contains the line `debug-kit 1.0.0 (latest 1.0.0)`.

### Stage 3 — Run capture

**E2E-09 @stage3 hook install is idempotent and non-destructive (L3).** Write `<home>/.claude/settings.json` = `{"theme":"dark"}`. Run `runKit(['hook','install'])` twice. Both exit 0 with stdout `SessionEnd hook installed in <home>/.claude/settings.json`. The file parses; `theme` is still `dark`; `hooks.SessionEnd` has exactly one entry, whose `hooks` array holds exactly one `{ type: "command", command: "kit report" }`.

**E2E-10 @stage3 report via hook stdin (L4, R1, R2, R3, R4, U4).** Import debug-kit, pull, report partial: exit 0, stdout `Reported 1 run(s)`. Open `/kits/debug-kit`, `tab-runs`: one `run-row` with `run-outcome` = `partial`, `run-corrections` = `2`, `run-version` = `1.0.0`. `GET /api/runs?kit=debug-kit` → one run with `sessionId` `sess-001`, `projectPath` `/tmp/proj-a`, and no key whose name contains `transcript`. `GET /api/feedback?kit=debug-kit&status=new` → 2 items with the exact X1 texts and quotes, kind `correction`. The library card shows `1 run` and `0%`.

**E2E-11 @stage3 idempotent, and sessions without a kit are ignored (L4).** After E2E-10's setup, report partial again with the same `session_id`: stdout `Reported 0 run(s)`, still one run and 2 feedback items. Report `transcript-no-kit.jsonl` as `sess-002`: stdout `No kits used`, still one run.

**E2E-12 @stage3 app down: queue, never fail (Reliability).** Import debug-kit and pull. Report partial with `env: { KITFORGE_URL: 'http://127.0.0.1:59999' }`: exit 0, stdout `Queued 1 report(s)`, `ms` < 12000, and `<home>/.kitforge/outbox/` holds exactly one `.json` file. Now report `transcript-no-kit.jsonl` as `sess-009` with the normal URL: stdout contains `Flushed 1 queued report(s)`; the outbox is empty; `GET /api/runs?kit=debug-kit` returns the `sess-001` run.

**E2E-13 @stage3 extraction failure is atomic (R3, Reliability).** Import, pull, report a transcript built with marker `MOCK:extract-fail` as `sess-010`: exit 0, stdout `Queued 1 report(s)`; no run and no feedback exist.

### Stage 4 — Inbox

**E2E-14 @stage4 triage (T1, T2, U6).** After E2E-10's setup, `inbox-count` = `2`. Open `nav-inbox`: `inbox-tab-new` shows 2 `inbox-item`s, each with `feedback-kit` `debug-kit` and its X1 `feedback-quote`. Click `feedback-accept` on F1 and `feedback-dismiss` on F2. `inbox-empty` = `Nothing to triage`; `inbox-count` is hidden. `inbox-tab-accepted` shows only F1. Reload: the same holds. `/kits/debug-kit` shows `improve-count` = `1 accepted`.

**E2E-15 @stage4 filter and tags (T1, T2).** Import both kits, pull both, report partial (`sess-001`) and `transcript-feature.jsonl` (`sess-004`). Inbox shows 3 items. Set `inbox-filter-kit` to `new-feature-kit`: 1 item, text `Edited the module without reading it first`. Set it to `all`, type `testing` in F1's `feedback-tag-input` and press Enter: a `feedback-tag` `testing` appears and is still there after reload.

**E2E-16 @stage4 manual note and outcome override (L5, R5, U5).** After E2E-10's setup, `runKit(['note','Good root-cause analysis','--rating','4'])`: exit 0, stdout matches `/^Added note to run #\d+$/m`. The inbox shows a third item with `feedback-text` `Good root-cause analysis` and `feedback-rating` `4/5`. On `tab-runs`, set `run-outcome-select` to `success`: after reload `run-outcome` = `success` and the library card shows `100%`. In a fresh home with an empty DB, `runKit(['note','x'])` exits 1 with stderr `No runs yet`.

**E2E-17 @stage4 keyboard triage (Accessibility).** After E2E-10's setup, open the inbox and press `j`: the first item has `data-focused="true"`. Press `a`: that item disappears from New and appears under Accepted. Press `j` then `d`: the New tab shows `inbox-empty`.

### Stage 5 — Improve and publish

**E2E-18 @stage5 proposal from accepted feedback (I1, I2, U7).** After E2E-10's setup, accept F1 and F2. On `/kits/debug-kit`, `improve-count` = `2 accepted`. Click `improve-button`, then `improve-submit`: `proposal-loading` is visible, then the URL matches `/kits/debug-kit/proposals/\d+`. Two `proposal-hunk`s: `data-file="SKILL.md"` and `data-file="references/checklist.md"`. The SKILL.md hunk's `hunk-removed` contains `1. Reproduce the bug with a failing test before changing code.` and its `hunk-added` contains `Never write the fix first.`. Each hunk has a non-empty `hunk-rationale`; the SKILL.md hunk's `hunk-feedback-link` has `data-feedback-id` = F1, the checklist hunk's has F2. `publish-button` is disabled. Accept one hunk: still disabled. Accept the other: enabled.

**E2E-19 @stage5 ★ THE CORE LOOP: feedback becomes a better installed kit (I3, I4, M1, L1, L4, U8, U9, U10).** This is the most important test in the suite. It proves KitForge's promise end to end: a correction captured from a real session changes the kit that Claude Code installs next, and the metrics show the difference.

1. Import debug-kit; pull; report partial as `sess-001`.
2. Accept F1 and F2; Improve; accept both hunks; leave `bump-select` at `minor`; click `publish-button`.
3. Redirected to `/kits/debug-kit`: `kit-current-version` = `1.1.0`; `file-viewer` (SKILL.md) contains `Never write the fix first.`
4. `tab-versions`: two `version-row`s; `1.1.0` has `data-current="true"`; under it, two `changelog-entry`s whose `changelog-feedback-link`s carry F1 and F2.
5. `inbox-tab-resolved` shows F1 and F2, each with `feedback-status` = `Resolved in 1.1.0`.
6. `GET /api/kits/debug-kit/files?version=1.0.0` is byte-identical to the original fixture (immutability).
7. Pull again: stdout `Installed debug-kit@1.1.0 to …`; the file on disk contains `Never write the fix first.`; `.kitforge.json` version = `1.1.0`. `kit list` prints `debug-kit 1.1.0 (latest 1.1.0)`.
8. Report `transcript-debug-success.jsonl` as `sess-002`: the new `run-row` has `run-version` = `1.1.0` and `run-outcome` = `success`.
9. `tab-metrics`: `metrics-row[data-version="1.0.0"]` shows runs `1`, success `0%`, corrections `2.0`; `metrics-row[data-version="1.1.0"]` shows runs `1`, success `100%`, corrections `0.0`.

**E2E-20 @stage5 partial accept and patch bump (I2, I3, I4).** Setup as E2E-18 with both hunks shown. Accept the SKILL.md hunk, reject the checklist hunk, set `bump-select` to `patch`, publish: current is `1.0.1`; its `references/checklist.md` equals the fixture; F1 shows `Resolved in 1.0.1`; F2 is back under `inbox-tab-accepted`, and `improve-count` = `1 accepted`.

**E2E-21 @stage5 unusable edits are dropped (I1 rule).** Setup: F1 and F2 accepted. Improve with `improve-instruction` = `MOCK:bad-hunk`: exactly one `proposal-hunk`; `proposal-dropped` = `1 suggested change couldn't be applied and was dropped`.

**E2E-22 @stage5 proposal failure is atomic (I1, Reliability).** Setup: F1 and F2 accepted. Improve with instruction `MOCK:proposal-fail`: `proposal-error` = `Couldn't generate a proposal. Nothing was changed.`; the URL is still `/kits/debug-kit`; `GET /api/proposals?kit=debug-kit&status=draft` returns `[]`; current version is `1.0.0`; F1 and F2 are still `accepted`.

### Stage 6 — Polish (P1)

**E2E-23 @stage6 edit a hunk before accepting (I5).** Setup as E2E-18. On the SKILL.md hunk click `hunk-edit`, set `hunk-edit-input` to `1. Always write a failing test first.`, click `hunk-edit-save`, accept both hunks, publish. `GET /api/kits/debug-kit/files?version=1.1.0` SKILL.md contains `1. Always write a failing test first.` and does not contain `Never write the fix first.`

**E2E-24 @stage6 regenerate with instruction (I6).** Setup as E2E-18. Note the proposal id. Type `shorter` in `regenerate-instruction` and click `regenerate-button`: the URL shows a new proposal id; one `proposal-hunk` whose `hunk-added` contains `3. Fix the root cause.`; `GET /api/proposals/<old id>` has `status: "discarded"`.

**E2E-25 @stage6 diff two versions (K6).** After E2E-19 steps 1–2, `tab-versions`, set `diff-from` = `1.0.0`, `diff-to` = `1.1.0`, click `diff-show`: `version-diff` contains both file names, the removed line `1. Reproduce the bug with a failing test before changing code.` and the added line `- [ ] Only the failing test run while iterating`.

**E2E-26 @stage6 rollback (K7, U11).** After E2E-19 steps 1–2, click `set-current-button` on `1.0.0`: `kit-current-version` = `1.0.0`; `pull-command` = `kit pull debug-kit@1.0.0`. Pull installs `1.0.0` and the file does not contain `Never write the fix first.` `GET /api/kits/debug-kit` still lists `1.1.0`.

**E2E-27 @stage6 manual edit, and stale proposals are refused (K8, I3 rule).** Setup as E2E-18 (proposal made against `1.0.0`; keep its URL). On `/kits/debug-kit` click `edit-kit-button`, pick `SKILL.md` in `edit-file-select`, append `4. Commit the test with the fix.` in `edit-textarea`, enter `Manual tweak` in `edit-changelog`, click `edit-save`: current is `1.0.1` with changelog `- Manual tweak`. Go back to the proposal URL, accept both hunks, publish: `publish-error` = `This proposal was made for 1.0.0, but the current version is 1.0.1. Regenerate it.`; no version `1.1.0` or `1.0.2` exists.

**E2E-28 @stage6 merge duplicates (T3).** Import, pull, report partial (`sess-001`) and `transcript-debug-dup.jsonl` (`sess-003`): 3 new items. Tick `inbox-select` on F1 and on the X3 item, click `merge-button`: 2 items remain; F1's `feedback-runs` = `2 runs`; `GET /api/feedback` shows the X3 item with `status: "merged"` and `mergedIntoId` = F1.

**E2E-29 @stage6 compare versions (M2).** After E2E-19 in full, click `compare-link`: `compare-a` shows `1.0.0` with `0%` and `2.0`; `compare-b` shows `1.1.0` with `100%` and `0.0`.

**E2E-30 @stage6 test counts (R6).** After E2E-10's setup, `run-tests` = `3 passed, 1 failed`. Report `transcript-feature.jsonl` for new-feature-kit (import and pull it first): that run's `run-tests` = `—`.

### Stage 7 — Self-reporting (added 2026-09-25)

The SessionEnd hook is dormant; runs are reported by the kit's own final step (PRD L7). E2E-09 … E2E-13 still pass and still cover the dormant `kit report` / `kit hook install` code.

**E2E-31 @stage7 self-report from the kit's final step (L7, R1, R2).** Import debug-kit. `POST /api/runs/report` with `{ session_id: "claude-001", kit: "debug-kit", version: "1.0.0", project_path: "/tmp/proj-b", outcome: "partial", corrections: [2 items, the second quote over 400 chars], tests: { passed: 5, failed: 1 } }` → 201 with `message` `Reported to KitForge: run #<id>, 2 correction(s)`. The same body again → 200, `created: false`, same run id. Unknown kit → 404, unknown version → 404, outcome `great` → 400. `GET /api/runs?kit=debug-kit` has exactly that one run (partial, 2 corrections, `/tmp/proj-b`); `GET /api/feedback?status=new` has both texts and every quote is under 300 chars. The Runs tab shows `partial`, `2`, `5 passed, 1 failed`; the inbox shows 2 items.

**E2E-32 @stage7 kits carry the reporting step, and it works as written (L1, L7).** Import debug-kit. Click `export-button`: the download is `debug-kit-1.0.0.zip` with exactly `debug-kit/SKILL.md` and `debug-kit/references/checklist.md`; SKILL.md starts with the fixture content and contains `## Final step: report this session to KitForge` and `"version": "1.0.0"`; the checklist equals the fixture; the kit still has one version. `runKit(['pull','debug-kit','--report'])` installs a SKILL.md identical to the exported one, and `.kitforge.json` `hash` equals the stored `contentHash`. Taking the URL and JSON template from the installed step, filling the placeholders and POSTing it creates a run (version 1.0.0, success, 1 correction). A plain `pull` afterwards installs SKILL.md byte-identical to the fixture again.

### Smoke — real Claude API (manual only)

Skipped unless `RUN_SMOKE=1`, `KITFORGE_LLM_MODE=real` and `ANTHROPIC_API_KEY` are set. `/api/test/reset` is unavailable, so smoke specs use a temporary `KITFORGE_DB_PATH` and start their own server. Assertions are loose.

**SMOKE-1 @smoke extraction.** Import debug-kit, pull, report `transcript-real-smoke.jsonl`. Within 60 s a run exists with at least 1 correction whose `text` matches `/test/i`; every `quote` is under 300 characters.

**SMOKE-2 @smoke proposal.** Accept all feedback, Improve. Within 90 s at least one `proposal-hunk` appears, and at least one has `data-file="SKILL.md"`.

**SMOKE-3 @smoke publish.** Accept all hunks and publish: `1.1.0` exists and its SKILL.md differs from `1.0.0`'s.

**SMOKE-4 @smoke real transcript format.** If `KITFORGE_SMOKE_TRANSCRIPT` points to a real Claude Code transcript from a session that used an installed kit, `kit report --transcript <path> --session-id smoke-real` reports at least 1 run. This catches drift between the fixture format and Claude Code's real format. If it fails, record the real format in `docs/DECISIONS.md` and update `detectKits` plus a new unit-test fixture.

## 3. Unit tests (Vitest), minimum set

`detectKits`, `trimTranscript`, `contentHash`, semver bump, `editsToHunks` (find must occur exactly once), `applyHunks` (applies in order; conflict raises `hunk_conflict`), metrics aggregation, settings.json merge for `kit hook install`, the zod schemas for both LLM outputs (reject malformed output).

## 4. Playwright MCP walkthrough

After a stage's specs pass, re-walk that stage's scenario IDs with the `playwright-headless` MCP server:

1. Start the app with `KITFORGE_LLM_MODE=mock` (`npm run dev`) and call `POST /api/test/reset`.
2. Run CLI steps (pull, report, note) from the shell with `HOME` set to a temp directory, exactly as the scenario says.
3. For UI steps: navigate, take an accessibility snapshot, act through the `data-testid` selectors, and snapshot after each key step. Check the same outcomes the spec asserts, using the inspection API where the DOM can't show it.
4. Record `E2E-xx: pass | fail — note` in `docs/VERIFICATION.md`.

A scenario that passes as a spec but fails in the walkthrough (or the reverse) is a bug in the spec or the app. Investigate and fix it; never mark it passed.
