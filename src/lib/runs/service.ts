import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback, kitVersions, kits, runs } from "@/db/schema";
import { getLlm } from "@/lib/llm";
import type { Extraction } from "@/lib/llm/schemas";
import type { Outcome } from "@/lib/metrics";

export class RunError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export interface RunReportInput {
  sessionId: string;
  kit: string;
  version: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
  transcript: string;
}

export interface RunDto {
  id: number;
  sessionId: string;
  kitName: string;
  version: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
  outcome: Outcome;
  outcomeOverridden: boolean;
  correctionCount: number;
  testsPassed: number | null;
  testsFailed: number | null;
}

function findRun(sessionId: string, kitId: number) {
  return getDb()
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.sessionId, sessionId), eq(runs.kitId, kitId)))
    .get();
}

function resolveKitVersion(kitName: string, semver: string) {
  const db = getDb();
  const kit = db.select().from(kits).where(eq(kits.name, kitName)).get();
  if (!kit) throw new RunError("kit_not_found", 404);
  const version = db
    .select()
    .from(kitVersions)
    .where(and(eq(kitVersions.kitId, kit.id), eq(kitVersions.semver, semver)))
    .get();
  if (!version) throw new RunError("version_not_found", 404);
  return { kitId: kit.id, versionId: version.id };
}

interface RunMeta {
  sessionId: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
}

/** Writes a run and its corrections in one transaction. Idempotent on (session, kit). */
function storeRun(target: { kitId: number; versionId: number }, meta: RunMeta, result: Extraction): { created: boolean; runId: number } {
  const db = getDb();
  return db.transaction(() => {
    const existing = findRun(meta.sessionId, target.kitId);
    if (existing) return { created: false, runId: existing.id };
    const run = db
      .insert(runs)
      .values({
        sessionId: meta.sessionId,
        kitId: target.kitId,
        kitVersionId: target.versionId,
        projectPath: meta.projectPath,
        startedAt: meta.startedAt,
        endedAt: meta.endedAt,
        outcome: result.outcome,
        testsPassed: result.tests?.passed ?? null,
        testsFailed: result.tests?.failed ?? null,
      })
      .returning({ id: runs.id })
      .get();
    for (const c of result.corrections) {
      db.insert(feedback).values({ runId: run.id, kitId: target.kitId, kind: "correction", text: c.text, quote: c.quote }).run();
    }
    return { created: true, runId: run.id };
  });
}

/**
 * Records one run from a transcript: extracts corrections with the LLM, then stores them.
 * Idempotent on (session, kit). The transcript is only passed to the LLM, never stored.
 */
export async function recordRun(input: RunReportInput): Promise<{ created: boolean; runId: number }> {
  const target = resolveKitVersion(input.kit, input.version);
  const existing = findRun(input.sessionId, target.kitId);
  if (existing) return { created: false, runId: existing.id };

  let extraction;
  try {
    extraction = await getLlm().extractRun(input.transcript);
  } catch {
    throw new RunError("extraction_failed", 502);
  }
  return storeRun(target, input, extraction);
}

export interface SelfReportInput extends Extraction {
  sessionId?: string;
  kit: string;
  version: string;
  projectPath: string;
}

/** A run reported by Claude itself from the kit's final step: no transcript, no LLM call. */
export function recordSelfReport(input: SelfReportInput): { created: boolean; runId: number } {
  const target = resolveKitVersion(input.kit, input.version);
  const now = new Date().toISOString();
  return storeRun(
    target,
    { sessionId: input.sessionId ?? `self-${randomUUID()}`, projectPath: input.projectPath, startedAt: now, endedAt: now },
    { outcome: input.outcome, corrections: input.corrections, tests: input.tests },
  );
}

export function listRuns(kitName?: string): RunDto[] {
  const db = getDb();
  const rows = db
    .select({
      id: runs.id,
      sessionId: runs.sessionId,
      kitName: kits.name,
      version: kitVersions.semver,
      projectPath: runs.projectPath,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      outcome: runs.outcome,
      outcomeOverridden: runs.outcomeOverridden,
      testsPassed: runs.testsPassed,
      testsFailed: runs.testsFailed,
    })
    .from(runs)
    .innerJoin(kits, eq(kits.id, runs.kitId))
    .innerJoin(kitVersions, eq(kitVersions.id, runs.kitVersionId))
    .where(kitName ? eq(kits.name, kitName) : undefined)
    .orderBy(desc(runs.id))
    .all();
  const counts = correctionCounts(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, correctionCount: counts.get(r.id) ?? 0 }));
}

export function correctionCounts(runIds: number[]): Map<number, number> {
  if (runIds.length === 0) return new Map();
  const rows = getDb()
    .select({ runId: feedback.runId, n: sql<number>`count(*)` })
    .from(feedback)
    .where(and(inArray(feedback.runId, runIds), eq(feedback.kind, "correction")))
    .groupBy(feedback.runId)
    .all();
  return new Map(rows.map((r) => [r.runId, r.n]));
}

/** R5: the user's judgement replaces the extracted outcome. */
export function setOutcome(runId: number, outcome: Outcome): void {
  const result = getDb().update(runs).set({ outcome, outcomeOverridden: true }).where(eq(runs.id, runId)).run();
  if (result.changes === 0) throw new RunError("run_not_found", 404);
}

/** L5 / U5: a manual note (optionally with a rating) becomes a feedback item on the run. */
export function addNote(runId: number, text: string, rating: number | null): number {
  const db = getDb();
  const run = db.select({ id: runs.id, kitId: runs.kitId }).from(runs).where(eq(runs.id, runId)).get();
  if (!run) throw new RunError("run_not_found", 404);
  return db
    .insert(feedback)
    .values({ runId: run.id, kitId: run.kitId, kind: "note", text, rating })
    .returning({ id: feedback.id })
    .get().id;
}
