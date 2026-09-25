import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback, kitVersions, kits, type FeedbackStatus } from "@/db/schema";

export class FeedbackError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export interface FeedbackDto {
  id: number;
  runIds: number[];
  kitName: string;
  kind: "correction" | "note" | "rating";
  text: string;
  quote: string | null;
  rating: number | null;
  tags: string[];
  status: FeedbackStatus;
  mergedIntoId: number | null;
  resolvedInVersion: string | null;
  createdAt: string;
}

export function countNewFeedback(): number {
  const row = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(feedback)
    .where(inArray(feedback.status, ["new", "accepted"]))
    .get();
  return row?.n ?? 0;
}

/** Newest first. `runIds` is the item's own run plus the runs of every item merged into it. */
export function listFeedback(filter: { kit?: string; status?: FeedbackStatus; ids?: number[] } = {}): FeedbackDto[] {
  const db = getDb();
  const all = db
    .select({
      id: feedback.id,
      runId: feedback.runId,
      kitName: kits.name,
      kind: feedback.kind,
      text: feedback.text,
      quote: feedback.quote,
      rating: feedback.rating,
      tags: feedback.tags,
      status: feedback.status,
      mergedIntoId: feedback.mergedIntoId,
      resolvedInVersion: kitVersions.semver,
      createdAt: feedback.createdAt,
    })
    .from(feedback)
    .innerJoin(kits, eq(kits.id, feedback.kitId))
    .leftJoin(kitVersions, eq(kitVersions.id, feedback.resolvedInVersionId))
    .where(filter.kit ? eq(kits.name, filter.kit) : undefined)
    .orderBy(desc(feedback.id))
    .all();

  const children = new Map<number, typeof all>();
  for (const item of all) {
    if (item.mergedIntoId === null) continue;
    children.set(item.mergedIntoId, [...(children.get(item.mergedIntoId) ?? []), item]);
  }
  const runIdsOf = (item: (typeof all)[number]): number[] => {
    const ids = new Set([item.runId]);
    for (const child of children.get(item.id) ?? []) for (const id of runIdsOf(child)) ids.add(id);
    return [...ids].sort((a, b) => a - b);
  };

  return all
    .filter((f) => (!filter.status || f.status === filter.status) && (!filter.ids || filter.ids.includes(f.id)))
    .map((f) => ({
      id: f.id,
      runIds: runIdsOf(f),
      kitName: f.kitName,
      kind: f.kind,
      text: f.text,
      quote: f.quote,
      rating: f.rating,
      tags: f.tags,
      status: f.status,
      mergedIntoId: f.mergedIntoId,
      resolvedInVersion: f.resolvedInVersion,
      createdAt: f.createdAt,
    }));
}

type TriageStatus = "new" | "accepted" | "dismissed";

/** T2: accept, dismiss (or reopen) and tag. Merged and resolved items are final. */
export function triageFeedback(id: number, patch: { status?: TriageStatus; tags?: string[] }): FeedbackDto {
  const db = getDb();
  const item = db.select().from(feedback).where(eq(feedback.id, id)).get();
  if (!item) throw new FeedbackError("feedback_not_found", 404);
  if (patch.status && (item.status === "merged" || item.status === "resolved")) throw new FeedbackError("feedback_final", 409);
  const tags = patch.tags ? [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))] : undefined;
  db.update(feedback)
    .set({ ...(patch.status ? { status: patch.status } : {}), ...(tags ? { tags } : {}) })
    .where(eq(feedback.id, id))
    .run();
  return listFeedback({ ids: [id] })[0];
}

/** T3: merge duplicates into the first id; the others keep their runs through `mergedIntoId`. */
export function mergeFeedback(ids: number[]): FeedbackDto {
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new FeedbackError("need_two_items", 400);
  const db = getDb();
  const items = db.select().from(feedback).where(inArray(feedback.id, unique)).all();
  if (items.length !== unique.length) throw new FeedbackError("feedback_not_found", 404);
  if (new Set(items.map((i) => i.kitId)).size !== 1) throw new FeedbackError("kit_mismatch", 400);
  if (items.some((i) => i.status === "merged" || i.status === "resolved")) throw new FeedbackError("feedback_final", 409);
  const [target, ...rest] = unique;
  db.transaction(() => {
    for (const id of rest) {
      db.update(feedback).set({ status: "merged", mergedIntoId: target }).where(eq(feedback.id, id)).run();
      // Items previously merged into a now-merged item follow it to the new target.
      db.update(feedback).set({ mergedIntoId: target }).where(and(eq(feedback.mergedIntoId, id), eq(feedback.status, "merged"))).run();
    }
  });
  return listFeedback({ ids: [target] })[0];
}
