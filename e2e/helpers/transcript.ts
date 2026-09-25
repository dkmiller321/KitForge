import fs from "node:fs";
import path from "node:path";

export type TranscriptObject = Record<string, unknown>;

export interface TranscriptOptions {
  /** `MOCK:<name>` marker prefixed to the first user message; omitted when null. */
  marker: string | null;
  /** Kit whose SKILL.md is read; no Read call when null. */
  skill: string | null;
  lastText?: string;
  correction?: string;
}

/** A Claude Code JSONL transcript in the shape of E2E_TESTS.md §1.4. */
export function buildTranscript(opts: TranscriptOptions): TranscriptObject[] {
  const opening = `${opts.marker ? `${opts.marker} ` : ""}The login test is failing, use the debug kit.`;
  const lines: TranscriptObject[] = [
    { type: "user", timestamp: "2026-09-20T10:00:00.000Z", message: { role: "user", content: opening } },
  ];
  if (opts.skill) {
    lines.push(
      {
        type: "assistant",
        timestamp: "2026-09-20T10:00:05.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tu_1", name: "Read", input: { file_path: `/Users/someone/.claude/skills/${opts.skill}/SKILL.md` } },
          ],
        },
      },
      {
        type: "user",
        timestamp: "2026-09-20T10:00:06.000Z",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "# Debug Kit ..." }] },
      },
    );
  }
  lines.push(
    {
      type: "assistant",
      timestamp: "2026-09-20T10:01:00.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "I'll patch the session check." }] },
    },
    {
      type: "user",
      timestamp: "2026-09-20T10:01:30.000Z",
      message: { role: "user", content: opts.correction ?? "Stop — write the failing test first, then fix it." },
    },
    {
      type: "assistant",
      timestamp: "2026-09-20T10:20:00.000Z",
      message: { role: "assistant", content: [{ type: "text", text: opts.lastText ?? "Done. 3 passed, 1 failed." }] },
    },
  );
  return lines;
}

export const TRANSCRIPTS = {
  "transcript-debug-partial.jsonl": buildTranscript({ marker: "MOCK:debug-partial", skill: "debug-kit" }),
  "transcript-debug-success.jsonl": buildTranscript({
    marker: "MOCK:debug-success",
    skill: "debug-kit",
    lastText: "Done. 4 passed, 0 failed.",
  }),
  "transcript-debug-dup.jsonl": buildTranscript({ marker: "MOCK:debug-dup", skill: "debug-kit" }),
  "transcript-feature.jsonl": buildTranscript({ marker: "MOCK:feature-partial", skill: "new-feature-kit" }),
  "transcript-no-kit.jsonl": buildTranscript({ marker: "MOCK:debug-partial", skill: null }),
  "transcript-real-smoke.jsonl": buildTranscript({
    marker: null,
    skill: "debug-kit",
    correction: "No — write the failing test first, then fix it.",
  }),
} as const;

export type TranscriptName = keyof typeof TRANSCRIPTS;

export function toJsonl(lines: TranscriptObject[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

export function writeTranscript(dir: string, name: string, lines: TranscriptObject[]): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, toJsonl(lines), "utf8");
  return file;
}
