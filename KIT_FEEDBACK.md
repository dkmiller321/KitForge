# KIT_FEEDBACK.md — self-improvement log

A running log of issues hit while building from this kit (`CLAUDE.md`, `KICKOFF.md`, `docs/PRD.md`, `docs/E2E_TESTS.md`, `.env.example`). Each entry records what happened, what it cost, and a concrete change for the next kit. The newest entries are at the bottom of each section.

Tags: **[env]** machine/setup · **[contract]** E2E_TESTS.md · **[prd]** PRD gaps · **[process]** CLAUDE.md/KICKOFF workflow · **[stack]** library/version surprises · **[agent]** my own mistakes

## Log

### 2026-09-24 · Kickoff and stage 0

1. **[env] Preconditions weren't checked before kickoff.** Docker Desktop wasn't running, the folder wasn't a git repo (every stage ends in a commit), `git user.name` was unset, and `.env` hadn't been copied. Each one needed a question to the user.
   - *Kit change:* add a `scripts/preflight.sh` (or a KICKOFF step 0) that checks `docker ps`, `git rev-parse`, `git config user.name`, `.env` present, Node/pnpm versions and free ports, and prints fixes.

2. **[env] Port 5432 was already taken by a local Postgres install.** Compose failed to bind. I moved it to 5433 and edited `.env.example`.
   - *Kit change:* default `POSTGRES_HOST_PORT` to something uncommon (e.g. 5433 or 55432) in `.env.example` and Compose from the start, and add the port to the preflight.

3. **[process] The approved-dependency list was too narrow for the PRD.** C2 (markdown + highlighting), D2 (Markdown round-trip), D9 (diff), a Postgres driver for Drizzle, and shadcn's own deps were all missing, which forced a blocking "ask before adding" question at kickoff.
   - *Kit change:* pre-approve `postgres`, `react-markdown`, `remark-gfm`, `shiki`, `@tiptap/markdown`, `@tiptap/extension-table`, `diff`, `radix-ui`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` in CLAUDE.md.

4. **[stack] Versions had moved past the model's training data.** The kit names packages but not versions. Installs got AI SDK v7 (LanguageModel spec **V4**), Next 16 and TypeScript 7 (the native port; I pinned `^5.9` so Next's type-check works). I had to read `.d.ts` files to learn the APIs.
   - *Kit change:* pin major versions in CLAUDE.md (e.g. `ai@7`, `next@16`, `typescript@5.9`), or ship a `package.json` skeleton with the lockfile.

5. **[contract] Tests-first baseline is slow.** 27 failing specs × 60 s timeout ≈ 27 minutes of dead time in stage 0.
   - *Kit change:* in stage 0 run only `--grep @stage0` plus `--list`, or set `timeout: 15_000` for the baseline run (`--timeout=15000`).

6. **[stack] Next 16 dev blocks `127.0.0.1` HMR origins** unless `allowedDevOrigins` is set. Playwright uses 127.0.0.1, so this is a warning plus possible flakiness.
   - *Kit change:* include `allowedDevOrigins: ["127.0.0.1"]` and `next dev -H 127.0.0.1` in the scaffold instructions.

7. **[prd] Mermaid conversion needs a DOM, but the tool contract implies the server saves version 1.** `@excalidraw/mermaid-to-excalidraw` only runs in the browser, so the browser has to save diagram v1 (DECISIONS #2).
   - *Kit change:* state this in the PRD's agent-tools table ("converted in the browser, which saves v1") so the builder doesn't have to discover it.

8. **[prd] `HOST=127.0.0.1` conflicts with running in Docker.** A server bound to 127.0.0.1 inside a container can't be reached from outside it.
   - *Kit change:* say "bind 0.0.0.0 inside the container, publish as `127.0.0.1:3000:3000`" in the PRD/CLAUDE.md.

### 2026-09-24 · Stages 1–4

9. **[stack] AI SDK: without `generateMessageId`, reply ids are not unique across conversations.** Persisting replies by id made chat B's reply overwrite chat A's. E2E-07 caught it.
   - *Kit change:* add to CLAUDE.md conventions: "pass `generateMessageId` to `toUIMessageStreamResponse`, and scope message upserts to their conversation."

10. **[contract] The isolated specs missed a real bug that a chained MCP walkthrough caught.** After a manual edit, closing and reopening the canvas showed stale text. Every spec starts from a fresh DB and never combines edit → close → reopen.
    - *Kit change:* add a scenario "manual edit, close canvas, reopen: the edit is shown" (and "close with an unsaved edit: it is still saved"). Also tell the MCP walkthrough to chain scenarios the way a user would, not only replay each spec.

11. **[contract] The mock's timing is too fast to observe with MCP round-trips.** The "Writing document…" status lasts about 50 ms, so step-by-step MCP calls never see it. I used an in-page MutationObserver instead.
    - *Kit change:* have the mock pause ~400 ms *after* the tool call as well (or stream tool input slowly), or say in E2E_TESTS §3 that transient states should be checked with an in-page observer.

12. **[agent] I added an assertion to E2E-13 that contradicted script S7** ("v3 contains `Use fresh beans. My note.`"). S7 inserts the conclusion between the two sentences, so the note moves to after "Enjoy responsibly.". It cost a failed run and a question to the user.
    - *Kit change:* when writing specs, derive any extra assertion from the mock script's exact output, and prefer checking the documented assertions only. Also, E2E_TESTS.md's note under E2E-13 ("still matches because the edit only appends after it") could say explicitly where the note ends up.

13. **[stack] The AI SDK masks tool error text in the UI stream by default** ("An error occurred."), so the user never sees why an edit failed.
    - *Kit change:* CLAUDE.md: "set `onError` on the UI stream to show tool-error messages (not other errors)."

14. **[process] The MCP sandbox has no `fetch`.** `browser_run_code_unsafe` code must use `page.request` for API calls. Also, Playwright's `getByText` is case-insensitive by default, which made a walkthrough check (`COFFEE` vs `Coffee`) pass falsely at first.
    - *Kit change:* add both to E2E_TESTS §3 (MCP walkthrough tips).

15. **[process] Stage-by-stage commits are awkward when shared UI spans stages.** The canvas panel (versions, quick actions, export menu, diagram editor) is one component, so the stage 3 commit contains code that is only verified in stages 4–7.
    - *Kit change:* either accept "stage N commit may contain later-stage code, verified later" in CLAUDE.md, or split milestones along component lines.

### 2026-09-24 · Stages 5–6

16. **[contract] Some P1 requirements have no mock script or scenario:** G3 skeleton diagrams, D9 diff view, and the "Ask AI" path for non-`shorten` instructions. They are built but only covered by unit tests and manual checks.
    - *Kit change:* add S14 `sketch a box` → `create_diagram` with `elements` (two rectangles + an arrow), plus scenarios for D9 ("Changes" shows a removal and an addition after E2E-12's edit).

17. **[contract] The MCP viewport (1280×720) is smaller than the spec viewport (1440×900).** The canvas is about 590 px wide under MCP, and drawing coordinates are proportional, so both happen to work. A fixed-coordinate drag would have diverged.
    - *Kit change:* state one viewport for both the specs and the MCP server (`--viewport-size` on the MCP server config).

18. **[process] Stages 5 and 6 passed on the first run** because the pure tool logic (`applyDiagramOps`) was unit-tested before it was wired up. That pattern worked well.
    - *Kit change:* in CLAUDE.md, have the builder write and unit-test all pure tool modules in stage 0/1, before any UI.

### 2026-09-24 · Stage 7

19. **[stack] Next 16 bans `react-dom/server` imports in the app bundle.** One route's import turned into a compile error that returned 500 from every route, including `/api/test/reset`, so all specs failed at `beforeEach`.
    - *Kit change:* CLAUDE.md stack notes: "no `react-dom/server` in route handlers; render export HTML from the Markdown AST." Also consider a stage-level smoke check (`curl /api/health` after each change) before running E2E.

20. **[agent][env] CRLF line endings silently broke scripted edits.** Search/replace scripts that match `\n` did nothing on files with `\r\n`, with no error. A feature (the settings link) went missing until an E2E spec caught it.
    - *Kit change:* ship a `.gitattributes` (`* text=auto eol=lf`) and `.editorconfig` in the kit. Tell the agent to use exact-match edit tools, or to assert that each scripted replacement matched.

21. **[contract] E2E-26 depends on accessible names that the selector contract doesn't list** ("Regenerate", "Edit message", "Save and send", "Conversation title"). I invented them while writing specs in stage 0.
    - *Kit change:* add `regenerate`, `edit-message`, `edit-message-input`, `edit-message-submit` and `rename-input` testids to the §1.5 contract, so specs and UI agree from day one.

22. **[prd] The E2E contract makes one PRD requirement impossible as written:** D9 "diff view before accepting" versus E2E-12, which applies edits immediately. I resolved it as "diff after apply, reject = restore" (DECISIONS #14).
    - *Kit change:* decide in the PRD whether AI edits need acceptance; if so, add an accept step to the scenarios.

### 2026-09-24 · Final acceptance

23. **[stack] `next build` evaluates route modules.** Anything that validates env at import time (a DB client created at module load) fails the Docker build, which has no `.env`. It only showed up at final acceptance, because local builds read `.env`.
    - *Kit change:* CLAUDE.md conventions: "create clients lazily; env is validated at first use/startup, never at import." Also run `docker compose build` in stage 0, not only at the end. The skeleton stage's "Done when" already says `docker compose up` works, so enforce it.

24. **[stack] Standalone output tracing drops Playwright's runtime files** (`browsers.json`), so server-side PDF export breaks only in the container. `outputFileTracingIncludes` didn't take effect for the dynamic route, and copying the packages in the Dockerfile fixed it.
    - *Kit change:* ship this Dockerfile snippet in the kit, and add "export PDF in the container" to stage 0's done-when (a trivial export route).

25. **[process] Final acceptance was the first time the Docker image ran.** Both container-only bugs above would have been found in stage 0 if each stage's checks included `BASE_URL=… pnpm test:e2e --grep @stageN` against Compose.
    - *Kit change:* make "build the image and run this stage's specs against it" part of every stage (it adds about a minute), or at least stages 0, 3 and 7.

26. **[env] No `OPENROUTER_API_KEY`, so the real-model path is unverified.** Everything tested is mock-only.
    - *Kit change:* KICKOFF could ask up front for a spend-limited key, or say explicitly that the smoke suite is optional. The mock should also cover the real provider's quirks (e.g. partial tool-input streaming, multiple tool calls in one step).

## Summary for the next kit (top 10 by impact)

1. A preflight script: Docker running, git repo + identity, `.env`, free ports (#1, #2).
2. Pin major versions of `ai`, `next`, `typescript` and friends, or ship a lockfile (#4).
3. Widen the pre-approved dependency list to what the PRD actually needs (#3).
4. Build and test against the Docker image from stage 0 (#23–#25).
5. Add a `.gitattributes`/`.editorconfig` for LF endings (#20).
6. Extend the testid contract with regenerate/edit/rename controls (#21).
7. Add scenarios for chained flows (edit → close → reopen) and for G3/D9 (#10, #16).
8. Settle D9 "accept before apply" in the PRD (#22).
9. Put the AI SDK gotchas in CLAUDE.md: `generateMessageId`, `onError` for tool errors, no `react-dom/server` (#9, #13, #19).
10. Speed up the tests-first baseline with a short timeout (#5).

### 2026-09-24 · After delivery: design pass

27. **[prd] The kit had no visual design direction.** "Open WebUI / Open Canvas / Excalidraw parity" was specified functionally only. The first build met every test but looked plain: raw-looking documents and uncoloured diagrams. The user had to supply reference screenshots after delivery.
    - *Kit change:* add a short `docs/DESIGN.md` with 2–3 reference screenshots, a type scale (UI vs reading font), a diagram house style (palette, fill style, grid), and a "definition of done" that includes an MCP screenshot review against the references at stages 3, 5 and 7.

28. **[contract] Tests guard behaviour, not aesthetics.** Every restyle passed all 28 specs unchanged, which is good, but it also means nothing caught the plain look.
    - *Kit change:* add a screenshot checkpoint to each UI stage in CLAUDE.md's workflow ("take MCP screenshots of the stage's screens, compare with DESIGN.md references, list gaps"). Optionally add Playwright visual snapshots for 3–4 key screens once the design settles.

29. **[process] The mock only produces trivial content** (a two-heading coffee guide, a three-box flowchart), so the UI was never exercised with realistic documents: tables, long lists, code, subgraphs.
    - *Kit change:* add a mock script with a rich document (tables, nested lists, quote, code) and a larger diagram (subgraph, decision diamond, data store), so both specs and screenshots cover real layouts.

### 2026-09-24 · v1.1 stages (8+)

30. **[contract] Stage tags don't grep cleanly past 9.** `--grep @stage1` also matches `@stage10`–`@stage15`, and `@stage[0-7]` matches `@stage1x`. Found while adding stages 8–15.
    - *Kit change:* use zero-padded or delimited tags (`@stage01`, or `@stage:1`), or tell the builder to grep with a trailing space (`"@stage1 "`).

31. **[contract] "Text present" assertions pass for invisible UI.** E2E-31's outline passed while the outline rail was hidden at the default canvas width. Only the MCP screenshot revealed it.
    - *Kit change:* use `toBeVisible()` for things a user must see, and state the viewport/canvas split in E2E_TESTS.md.

32. **[env] OS clipboard line endings differ** (Windows `\r\n`). Any clipboard assertion should normalise line endings.
    - *Kit change:* mention it in the harness section, next to the clipboard permission note.

33. **[process] Scope grew after delivery** ("parity with Open Canvas and leading editors"). The PRD's parity table was functional and incomplete (no toolbar, slash menu, branch, code canvas, diagram presets…).
    - *Kit change:* the PRD template should include a competitor feature matrix (rows = features, columns = reference products, plus an in/out-of-scope column), filled in during the brainstorm phase.

34. **[contract] "Contains" assertions miss misplaced content.** E2E-33/34 checked that the Markdown *contained* the new block, and passed while the block was inserted above the title. Only the MCP screenshot showed it.
    - *Kit change:* for editor scenarios, assert position (e.g. "after X", "title unchanged") or compare the whole expected document, not just `toContain`.

35. **[process] MCP walkthrough scripts have their own bugs.** `page.waitForFunction(async () => …)` never waits (a Promise is truthy), which produced a false failure for E2E-39. Real-click walkthroughs also need scene-to-screen coordinates for canvas apps.
    - *Kit change:* add MCP helper snippets to E2E_TESTS §3: wait on `waitForResponse`/`expect.poll`, and a `sceneToViewport` helper for Excalidraw (`(x + scrollX) * zoom + offsetLeft`).

### 2026-09-25 · v1.1 retrospective

36. **[stack] Library claims vs reality.** mermaid-to-excalidraw 2.2 lists class/state/ER support, but in this build they fall back to a flat image (with console errors). Only a spec that asserted "no image elements" (E2E-44) caught it.
    - *Kit change:* for every third-party conversion the PRD depends on, add an E2E assertion on the *shape* of the output (editable elements), not just "something rendered".

37. **[process] Screenshot reviews found 9 real UI defects the specs missed** in v1.1 alone: the hidden outline rail, the typing-after-click bug, a tinted active line, grey sequence actors, an arrow into empty space, an ER label overlapping boxes, the off-screen redraw, the stray Ask AI button, and the PDF task-list layout.
    - *Kit change:* make "MCP screenshot review, list defects, fix, re-shoot" a required step of every UI stage in CLAUDE.md, not an optional extra. It has the best defects-found-per-minute of any check in this build.

38. **[process] Unit-testing pure transforms first paid off again.** Layout, presets, the Mermaid fallback, the selection scope and the export renderers were all pure and unit-tested before wiring, so stages 12–15 mostly passed their E2E specs on the first run.

### 2026-09-25 · README

39. **[process] README screenshots had to be re-shot from scratch.** The build-time screenshots were unusable for a README: a mix of UI generations, the Next.js dev badge, a menu caught mid-fade, placeholder "Mock Title" chats, and toy-sized mock diagrams. Class and ER diagram layouts showed crossing or crowded edges with more than about four nodes, a real gap that the small mock scripts never exercised (since fixed: see VERIFICATION.md).
    - *Kit change:* add a final "README & showcase" stage: a seeded demo script (rich doc, named chats, larger diagrams of each type), shot against the production build at a fixed viewport into a committed `docs/images/`. Add a mock script with a 6+ node class diagram and ER diagram to E2E so layout crowding is caught during the build.

### 2026-09-25 · Stage 16 (diagram formats)

40. **[process] Unit tests passed and E2E passed first time, yet screenshots found 6 layout defects.** The label/text/containment assertions in E2E-50/51 were all true while frames overlapped and arrows cut through shapes. The fixes held only after geometric invariants went into the unit tests: no shape overlaps, frames enclose exactly their members, frames overlap only when nested, no arrow crosses a shape it doesn't connect, and labels sit outside frames they cross.
    - *Kit change:* for any auto-layout feature, the PRD should list the geometric invariants, and the kit should ship a reusable `layoutInvariants(scene)` test helper that every diagram spec calls.

41. **[stack] Grouped layout needs a compound (nested) algorithm from the start.** Keeping group members together within columns is a dead end for nested containers. Laying out each group on its own and placing it as one box is simple (about 250 lines here) and makes frame overlap impossible by construction.
    - *Kit change:* note in the diagramming stack guidance: "groups/containers → compound layout plus ports", and consider ELK (elkjs, EPL-2.0) as a pre-approved option if a project needs orthogonal routing.
