# KitForge

A personal registry for Claude Code kits (skills). It versions every kit, records how each run went, and turns that feedback into proposed new versions that you review hunk by hunk.

Skills drift: you tweak a prompt, forget why, and can't tell whether the change helped. KitForge treats a kit like a package. Each version is immutable, each Claude Code session that used it reports back, and an LLM reads the feedback and proposes edits that you accept or reject the way you would a pull request.

<!-- TODO: add a screenshot of the kit detail page with a proposal open in review -->

## Quickstart

Requires Node 22. No API key is needed: `.env.example` starts in mock mode with a scripted model.

```bash
git clone https://github.com/dkmiller321/KitForge
cd KitForge
npm install
cp .env.example .env
npm run dev          # http://127.0.0.1:4317, migrations run on start
```

`better-sqlite3` is a native module. If `npm install` cannot download a prebuilt binary for your platform it compiles one, which on Windows needs the Visual Studio C++ build tools.

Import a kit (a folder or zip containing a `SKILL.md`) from the Library page, then install it into Claude Code with the CLI:

```bash
npm link                         # puts `kit` on your PATH
kit pull debug-kit@1.0.0         # installs into ~/.claude/skills/debug-kit
kit hook install                 # adds a SessionEnd hook that reports each run
kit list                         # installed and latest versions
kit note "skipped the repro step"   # attach a note to the most recent run
```

For real analysis and proposals, set `KITFORGE_LLM_MODE=real`, `OPENROUTER_API_KEY` and `KITFORGE_MODEL` in `.env`.

## Architecture

```
Claude Code session ──SessionEnd hook──> kit report ──> POST /api/runs
                                                            |
Browser ──> Next.js 15 app (Library, kit detail, Inbox)     v
                 |                               feedback extracted from the run
                 v                                          |
        SQLite (better-sqlite3 + Drizzle)   <───────────────┘
        immutable kit versions, runs, feedback
                 |
                 v
        LLM (OpenRouter, or a scripted mock) proposes find/replace edits
                 |
                 v
        Review: accept or reject each hunk ──> new version + changelog
```

- **Versions are immutable.** New content always creates a new version; nothing updates or deletes an old one.
- **The LLM never writes diffs.** It returns find/replace edits. The server checks that each `find` occurs exactly once, then renders it as a hunk.
- **Transcripts are never stored.** Only extracted text and short quotes are kept.
- **`kit report` cannot break a session.** It always exits 0, times out, and queues to `~/.kitforge/outbox/` on failure.

## Tests

```bash
npm test             # Vitest unit and API tests (52)
npm run typecheck
npm run test:e2e     # Playwright, against the mock model
```

Each E2E spec maps to a scenario in [docs/E2E_TESTS.md](docs/E2E_TESTS.md).

## Docs

[PRD](docs/PRD.md) · [acceptance contract](docs/E2E_TESTS.md) · [decisions](docs/DECISIONS.md) · [verification log](docs/VERIFICATION.md)

## License

[MIT](LICENSE) © 2026 Donald Miller
