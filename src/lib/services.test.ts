import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/db";
import { listFeedback, mergeFeedback, triageFeedback } from "./feedback/service";
import { kitFromEntries, readFolder } from "./kits/parse";
import { KitError, createManualVersion, getKit, getVersionFiles, importKit, kitMetrics, setCurrentVersion } from "./kits/service";
import { ProposalError, createProposal, decideHunk, getProposal, listProposals, publishProposal } from "./proposals/service";
import { RunError, addNote, listRuns, recordRun } from "./runs/service";

const DEBUG_KIT = path.resolve("e2e/fixtures/debug-kit");
const report = (sessionId: string, marker: string, version = "1.0.0") =>
  recordRun({
    sessionId,
    kit: "debug-kit",
    version,
    projectPath: "/tmp/p",
    startedAt: "2026-09-20T10:00:00.000Z",
    endedAt: "2026-09-20T10:20:00.000Z",
    transcript: `[user] ${marker} fix the login test`,
  });

beforeEach(() => {
  resetDb();
  importKit(kitFromEntries(readFolder(DEBUG_KIT), "debug-kit"));
});

describe("runs", () => {
  it("records a run with its corrections and is idempotent per session and kit", async () => {
    expect(await report("s1", "MOCK:debug-partial")).toEqual({ created: true, runId: 1 });
    expect(await report("s1", "MOCK:debug-partial")).toEqual({ created: false, runId: 1 });
    const [run] = listRuns("debug-kit");
    expect(run).toMatchObject({ outcome: "partial", correctionCount: 2, testsPassed: 3, testsFailed: 1 });
    expect(Object.keys(run).some((k) => k.toLowerCase().includes("transcript"))).toBe(false);
    expect(listFeedback()).toHaveLength(2);
  });

  it("writes nothing when extraction fails", async () => {
    await expect(report("s2", "MOCK:extract-fail")).rejects.toMatchObject({ code: "extraction_failed", status: 502 });
    expect(listRuns()).toEqual([]);
    expect(listFeedback()).toEqual([]);
  });

  it("rejects unknown versions and notes on unknown runs", async () => {
    await expect(report("s3", "MOCK:debug-partial", "9.9.9")).rejects.toBeInstanceOf(RunError);
    expect(() => addNote(42, "x", null)).toThrow(RunError);
  });
});

describe("feedback", () => {
  it("merges into the first id and keeps every source run", async () => {
    await report("s1", "MOCK:debug-partial");
    await report("s3", "MOCK:debug-dup");
    const merged = mergeFeedback([1, 3]);
    expect(merged.runIds).toEqual([1, 2]);
    expect(listFeedback({ ids: [3] })[0]).toMatchObject({ status: "merged", mergedIntoId: 1 });
    expect(() => triageFeedback(3, { status: "accepted" })).toThrow();
  });
});

describe("proposals and publish", () => {
  beforeEach(async () => {
    await report("s1", "MOCK:debug-partial");
    triageFeedback(1, { status: "accepted" });
    triageFeedback(2, { status: "accepted" });
  });

  it("publishes accepted hunks as a new version and leaves the old one untouched", async () => {
    const before = getVersionFiles("debug-kit", "1.0.0");
    const proposal = await createProposal("debug-kit", {});
    for (const h of proposal.hunks) decideHunk(h.id, { decision: "accepted" });
    expect(publishProposal(proposal.id, "minor")).toEqual({ version: "1.1.0" });
    expect(getVersionFiles("debug-kit", "1.0.0")).toEqual(before);
    expect(getVersionFiles("debug-kit").files.find((f) => f.path === "SKILL.md")?.content).toContain("Never write the fix first.");
    expect(getKit("debug-kit")!.versions[0].changelogMd).toBe(
      "- Make test-first explicit so the fix is never written first. (#1)\n- Keep iteration on the single failing test. (#2)",
    );
    expect(listFeedback({ status: "resolved" }).map((f) => f.resolvedInVersion)).toEqual(["1.1.0", "1.1.0"]);
    expect(getProposal(proposal.id)!.status).toBe("published");
  });

  it("refuses a stale proposal", async () => {
    const proposal = await createProposal("debug-kit", {});
    for (const h of proposal.hunks) decideHunk(h.id, { decision: "accepted" });
    createManualVersion("debug-kit", [{ path: "SKILL.md", content: "# Changed\n" }], "Manual tweak", "patch");
    expect(() => publishProposal(proposal.id, "minor")).toThrow(
      "This proposal was made for 1.0.0, but the current version is 1.0.1. Regenerate it.",
    );
    expect(getKit("debug-kit")!.versions.map((v) => v.semver)).toEqual(["1.0.1", "1.0.0"]);
  });

  it("refuses to publish with undecided hunks or nothing accepted", async () => {
    const proposal = await createProposal("debug-kit", {});
    expect(() => publishProposal(proposal.id, "minor")).toThrow(ProposalError);
    for (const h of proposal.hunks) decideHunk(h.id, { decision: "rejected" });
    expect(() => publishProposal(proposal.id, "minor")).toThrow(ProposalError);
  });

  it("keeps one draft per kit and writes nothing when the LLM fails", async () => {
    const first = await createProposal("debug-kit", {});
    await createProposal("debug-kit", { instruction: "shorter" });
    expect(getProposal(first.id)!.status).toBe("discarded");
    await expect(createProposal("debug-kit", { instruction: "MOCK:proposal-fail" })).rejects.toMatchObject({ code: "proposal_failed" });
    expect(listProposals({ kit: "debug-kit", status: "draft" })).toHaveLength(1);
  });

  it("bumps from the highest version after a rollback", async () => {
    const proposal = await createProposal("debug-kit", {});
    for (const h of proposal.hunks) decideHunk(h.id, { decision: "accepted" });
    publishProposal(proposal.id, "minor");
    setCurrentVersion("debug-kit", "1.0.0");
    const kit = createManualVersion("debug-kit", [{ path: "SKILL.md", content: "# Rolled back and edited\n" }], "", "minor");
    expect(kit.currentVersion).toBe("1.2.0");
    expect(kitMetrics("debug-kit").map((m) => m.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
  });
});

describe("imports", () => {
  it("rejects duplicates", () => {
    expect(() => importKit(kitFromEntries(readFolder(DEBUG_KIT), "debug-kit"))).toThrow(KitError);
  });

  it("stores files exactly as given", () => {
    const files = getVersionFiles("debug-kit", "1.0.0").files;
    expect(files.find((f) => f.path === "SKILL.md")?.content).toBe(fs.readFileSync(path.join(DEBUG_KIT, "SKILL.md"), "utf8"));
  });
});
