import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSCRIPTS, toJsonl } from "../../e2e/helpers/transcript";
import { mergeHookSettings } from "../cli/hook";
import { contentHash } from "./kits/hash";
import { applyHunks, editsToHunks, HunkConflictError } from "./kits/hunks";
import { KitImportError, kitFromEntries } from "./kits/parse";
import { bumpSemver, compareSemver, nextVersion } from "./kits/semver";
import { mockExtraction, mockProposal } from "./llm/mock";
import { extractionSchema, proposalSchema } from "./llm/schemas";
import { aggregateMetrics, formatCorrections, formatPercent } from "./metrics";
import { detectKits, parseTranscript, sessionTimes, TRANSCRIPT_MAX, trimTranscript } from "./runs/transcript";

const SKILL = fs.readFileSync(path.join("e2e", "fixtures", "debug-kit", "SKILL.md"), "utf8");
const CHECKLIST = fs.readFileSync(path.join("e2e", "fixtures", "debug-kit", "references", "checklist.md"), "utf8");
const FILES = [
  { path: "SKILL.md", content: SKILL },
  { path: "references/checklist.md", content: CHECKLIST },
];

describe("transcript fixtures", () => {
  it("static files match the builders", () => {
    for (const [name, lines] of Object.entries(TRANSCRIPTS)) {
      expect(fs.readFileSync(path.join("e2e", "fixtures", name), "utf8")).toBe(toJsonl([...lines]));
    }
  });
});

describe("detectKits", () => {
  it("finds kits whose SKILL.md was read", () => {
    expect(detectKits([...TRANSCRIPTS["transcript-debug-partial.jsonl"]])).toEqual(["debug-kit"]);
    expect(detectKits([...TRANSCRIPTS["transcript-feature.jsonl"]])).toEqual(["new-feature-kit"]);
  });

  it("ignores sessions without a skill read", () => {
    expect(detectKits([...TRANSCRIPTS["transcript-no-kit.jsonl"]])).toEqual([]);
  });

  it("handles Windows paths, other tools, user lines and duplicates", () => {
    const read = (file_path: string, name = "Read") => ({
      type: "assistant",
      message: { content: [{ type: "tool_use", name, input: { file_path } }] },
    });
    expect(
      detectKits([
        read("C:\\Users\\me\\.claude\\skills\\debug-kit\\SKILL.md"),
        read("/home/me/.claude/skills/debug-kit/SKILL.md"),
        read("/home/me/.claude/skills/other/README.md"),
        read("/home/me/.claude/skills/edited/SKILL.md", "Edit"),
        { type: "user", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/x/.claude/skills/u/SKILL.md" } }] } },
      ]),
    ).toEqual(["debug-kit"]);
  });

  it("parses JSONL, skipping broken lines, and reads session times", () => {
    const lines = parseTranscript(`${toJsonl([...TRANSCRIPTS["transcript-debug-partial.jsonl"]])}{"type":"user","tim`);
    expect(lines).toHaveLength(6);
    expect(sessionTimes(lines)).toEqual({ startedAt: "2026-09-20T10:00:00.000Z", endedAt: "2026-09-20T10:20:00.000Z" });
  });
});

describe("trimTranscript", () => {
  it("keeps text and tool calls", () => {
    const text = trimTranscript([...TRANSCRIPTS["transcript-debug-partial.jsonl"]]);
    expect(text).toContain("[user] MOCK:debug-partial The login test is failing");
    expect(text).toContain('[tool_use Read] {"file_path":"/Users/someone/.claude/skills/debug-kit/SKILL.md"}');
    expect(text).toContain("[tool_result] # Debug Kit ...");
    expect(text).toContain("[assistant] Done. 3 passed, 1 failed.");
  });

  it("truncates tool results over 2,000 characters", () => {
    const text = trimTranscript([
      { type: "user", message: { content: [{ type: "tool_result", content: [{ type: "text", text: "x".repeat(2500) }] }] } },
    ]);
    expect(text).toBe("[tool_result] [truncated 2500 chars]");
  });

  it("caps the whole string by dropping the middle", () => {
    const lines = Array.from({ length: 400 }, (_, i) => ({
      type: "user",
      message: { content: `${String(i).padStart(4, "0")} ${"y".repeat(1990)}` },
    }));
    const text = trimTranscript(lines);
    expect(text.length).toBe(TRANSCRIPT_MAX);
    expect(text).toContain("[... trimmed ...]");
    expect(text.startsWith("[user] 0000")).toBe(true);
    expect(text.endsWith("y")).toBe(true);
  });
});

describe("contentHash", () => {
  it("is order independent and matches the documented format", async () => {
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256")
      .update(`SKILL.md\n${SKILL}\nreferences/checklist.md\n${CHECKLIST}\n`)
      .digest("hex");
    expect(contentHash(FILES)).toBe(expected);
    expect(contentHash([...FILES].reverse())).toBe(expected);
  });
});

describe("semver", () => {
  it("bumps", () => {
    expect(bumpSemver("1.0.0", "minor")).toBe("1.1.0");
    expect(bumpSemver("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpSemver("1.2.3", "major")).toBe("2.0.0");
  });

  it("bumps from the highest existing version", () => {
    expect(nextVersion(["1.0.0", "1.1.0", "1.0.1"], "minor")).toBe("1.2.0");
    expect(nextVersion(["1.0.0", "1.10.0", "1.9.0"], "patch")).toBe("1.10.1");
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });
});

describe("editsToHunks", () => {
  it("keeps edits whose find occurs exactly once and drops the rest", () => {
    const { hunks, dropped } = editsToHunks(FILES, mockProposal({ files: FILES, feedback: [{ id: 1, text: "a", quote: null }], instruction: "MOCK:bad-hunk" }).edits);
    expect(hunks).toHaveLength(1);
    expect(dropped).toBe(1);
    expect(hunks[0].filePath).toBe("SKILL.md");
  });

  it("drops edits to unknown files and ambiguous finds", () => {
    const edit = { rationale: "r", feedback_ids: [1], replace: "z" };
    const { hunks, dropped } = editsToHunks([{ path: "a.md", content: "x\nx\n" }], [
      { ...edit, file: "missing.md", find: "x" },
      { ...edit, file: "a.md", find: "x" },
    ]);
    expect(hunks).toEqual([]);
    expect(dropped).toBe(2);
  });
});

describe("applyHunks", () => {
  it("applies hunks in order", () => {
    const out = applyHunks(FILES, [
      { filePath: "SKILL.md", findText: "3. Fix the root cause, not the symptom.", replaceText: "3. Fix the root cause." },
      { filePath: "SKILL.md", findText: "3. Fix the root cause.", replaceText: "3. Fix it." },
    ]);
    expect(out.find((f) => f.path === "SKILL.md")?.content).toContain("3. Fix it.\n");
    expect(out.find((f) => f.path === "references/checklist.md")?.content).toBe(CHECKLIST);
  });

  it("raises hunk_conflict when a find is no longer unique", () => {
    expect(() =>
      applyHunks(FILES, [
        { filePath: "SKILL.md", findText: "Debug Kit", replaceText: "Gone" },
        { filePath: "SKILL.md", findText: "Debug Kit", replaceText: "Again" },
      ]),
    ).toThrow(HunkConflictError);
  });
});

describe("aggregateMetrics", () => {
  it("computes runs, success rate and corrections per version", () => {
    const m = aggregateMetrics(["1.1.0", "1.0.0", "0.9.0"], [
      { version: "1.0.0", outcome: "partial", correctionCount: 2 },
      { version: "1.1.0", outcome: "success", correctionCount: 0 },
      { version: "1.1.0", outcome: "failed", correctionCount: 1 },
    ]);
    expect(m).toEqual([
      { version: "1.1.0", runs: 2, successRate: 0.5, correctionsPerRun: 0.5 },
      { version: "1.0.0", runs: 1, successRate: 0, correctionsPerRun: 2 },
      { version: "0.9.0", runs: 0, successRate: null, correctionsPerRun: null },
    ]);
    expect([formatPercent(0.5), formatPercent(null), formatCorrections(2), formatCorrections(0)]).toEqual(["50%", "—", "2.0", "0.0"]);
  });
});

describe("mergeHookSettings", () => {
  it("adds one SessionEnd command and keeps other settings", () => {
    const once = mergeHookSettings({ theme: "dark", hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }] } });
    const twice = mergeHookSettings(once);
    expect(twice.theme).toBe("dark");
    expect((twice.hooks as Record<string, unknown>).Stop).toEqual([{ hooks: [{ type: "command", command: "x" }] }]);
    expect((twice.hooks as Record<string, unknown>).SessionEnd).toEqual([{ hooks: [{ type: "command", command: "kit report" }] }]);
  });

  it("starts from nothing", () => {
    expect(mergeHookSettings(undefined)).toEqual({ hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "kit report" }] }] } });
  });
});

describe("LLM output schemas", () => {
  it("accept every mock script", () => {
    for (const marker of ["debug-partial", "debug-success", "debug-dup", "feature-partial", "none"]) {
      expect(extractionSchema.safeParse(mockExtraction(`MOCK:${marker}`)).success).toBe(true);
    }
    for (const instruction of [undefined, "shorter", "MOCK:bad-hunk"]) {
      expect(proposalSchema.safeParse(mockProposal({ files: FILES, feedback: [{ id: 1, text: "a", quote: null }], instruction })).success).toBe(true);
    }
  });

  it("reject malformed output", () => {
    expect(extractionSchema.safeParse({ outcome: "great", corrections: [], tests: null }).success).toBe(false);
    expect(extractionSchema.safeParse({ outcome: "success", corrections: [{ text: "t", quote: "q".repeat(300) }], tests: null }).success).toBe(false);
    expect(extractionSchema.safeParse({ outcome: "success", corrections: [] }).success).toBe(false);
    expect(proposalSchema.safeParse({ edits: [{ file: "SKILL.md", find: "", replace: "x", rationale: "r", feedback_ids: [1] }] }).success).toBe(false);
    expect(proposalSchema.safeParse({ edits: [{ file: "SKILL.md", find: "a", replace: "x", rationale: "r", feedback_ids: [] }] }).success).toBe(false);
    expect(proposalSchema.safeParse({ diff: "--- a" }).success).toBe(false);
  });

  it("mock scripts follow the contract", () => {
    expect(() => mockExtraction("MOCK:extract-fail")).toThrow();
    expect(mockExtraction("no marker")).toEqual({ outcome: "success", corrections: [], tests: null });
    expect(() => mockProposal({ files: FILES, feedback: [], instruction: "MOCK:proposal-fail" })).toThrow();
    const p1 = mockProposal({ files: FILES, feedback: [{ id: 7, text: "b", quote: null }, { id: 3, text: "a", quote: null }] });
    expect(p1.edits.map((e) => e.feedback_ids)).toEqual([[3], [7]]);
  });
});

describe("kitFromEntries", () => {
  it("strips a single wrapping folder and reads the frontmatter name", () => {
    const kit = kitFromEntries(FILES.map((f) => ({ ...f, path: `debug-kit/${f.path}` })), "upload");
    expect(kit.name).toBe("debug-kit");
    expect(kit.title).toBe("Debug Kit");
    expect(kit.files.map((f) => f.path).sort()).toEqual(["SKILL.md", "references/checklist.md"]);
  });

  it("rejects a folder without SKILL.md", () => {
    expect(() => kitFromEntries([{ path: "README.md", content: "# Not a kit" }], "x")).toThrow(KitImportError);
    expect(() => kitFromEntries([{ path: "README.md", content: "# Not a kit" }], "x")).toThrow("No SKILL.md found");
  });
});
