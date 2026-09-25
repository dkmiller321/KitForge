import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback, kitVersions, kits, proposalHunks, proposals } from "@/db/schema";
import { getLlm } from "@/lib/llm";
import { HunkConflictError, applyHunks, editsToHunks } from "@/lib/kits/hunks";
import { filesForVersion, insertVersion, requireKit } from "@/lib/kits/service";
import { nextVersion, type Bump } from "@/lib/kits/semver";

export class ProposalError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type Decision = "pending" | "accepted" | "rejected";

export interface HunkDto {
  id: number;
  filePath: string;
  findText: string;
  replaceText: string;
  editedReplace: string | null;
  rationale: string;
  feedbackIds: number[];
  decision: Decision;
}

export interface ProposalDto {
  id: number;
  kitName: string;
  baseVersion: string;
  status: "draft" | "published" | "discarded";
  instruction: string | null;
  feedbackIds: number[];
  droppedCount: number;
  createdAt: string;
  hunks: HunkDto[];
}

/** I1: ask the LLM for find/replace edits against the current version; keep only edits that apply. */
export async function createProposal(kitName: string, opts: { feedbackIds?: number[]; instruction?: string }): Promise<ProposalDto> {
  const db = getDb();
  const kit = requireKit(kitName);
  const accepted = db
    .select({ id: feedback.id, text: feedback.text, quote: feedback.quote })
    .from(feedback)
    .where(and(eq(feedback.kitId, kit.id), eq(feedback.status, "accepted")))
    .orderBy(asc(feedback.id))
    .all();
  const chosen = opts.feedbackIds?.length ? accepted.filter((f) => opts.feedbackIds!.includes(f.id)) : accepted;
  if (chosen.length === 0) throw new ProposalError("no_accepted_feedback", 400);

  const files = filesForVersion(kit.currentVersionId);
  const instruction = opts.instruction?.trim() || undefined;
  let proposal;
  try {
    proposal = await getLlm().proposeImprovement({ files, feedback: chosen, instruction });
  } catch {
    throw new ProposalError("proposal_failed", 502);
  }

  const known = new Set(chosen.map((f) => f.id));
  const { hunks, dropped } = editsToHunks(files, proposal.edits);
  const id = db.transaction(() => {
    db.update(proposals)
      .set({ status: "discarded" })
      .where(and(eq(proposals.kitId, kit.id), eq(proposals.status, "draft")))
      .run();
    const row = db
      .insert(proposals)
      .values({ kitId: kit.id, baseVersionId: kit.currentVersionId, feedbackIds: [...known], instruction: instruction ?? null, droppedCount: dropped })
      .returning({ id: proposals.id })
      .get();
    hunks.forEach((h, position) => {
      const cited = h.feedbackIds.filter((f) => known.has(f));
      db.insert(proposalHunks)
        .values({
          proposalId: row.id,
          position,
          filePath: h.filePath,
          findText: h.findText,
          replaceText: h.replaceText,
          rationale: h.rationale,
          feedbackIds: cited.length ? cited : [...known],
        })
        .run();
    });
    return row.id;
  });
  return getProposal(id)!;
}

export function getProposal(id: number): ProposalDto | null {
  const db = getDb();
  const p = db
    .select({
      id: proposals.id,
      kitName: kits.name,
      baseVersion: kitVersions.semver,
      status: proposals.status,
      instruction: proposals.instruction,
      feedbackIds: proposals.feedbackIds,
      droppedCount: proposals.droppedCount,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .innerJoin(kits, eq(kits.id, proposals.kitId))
    .innerJoin(kitVersions, eq(kitVersions.id, proposals.baseVersionId))
    .where(eq(proposals.id, id))
    .get();
  if (!p) return null;
  const hunks = db
    .select({
      id: proposalHunks.id,
      filePath: proposalHunks.filePath,
      findText: proposalHunks.findText,
      replaceText: proposalHunks.replaceText,
      editedReplace: proposalHunks.editedReplace,
      rationale: proposalHunks.rationale,
      feedbackIds: proposalHunks.feedbackIds,
      decision: proposalHunks.decision,
    })
    .from(proposalHunks)
    .where(eq(proposalHunks.proposalId, id))
    .orderBy(asc(proposalHunks.position))
    .all();
  return { ...p, hunks };
}

export function listProposals(filter: { kit?: string; status?: ProposalDto["status"] }): ProposalDto[] {
  const rows = getDb()
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(kits, eq(kits.id, proposals.kitId))
    .where(and(filter.kit ? eq(kits.name, filter.kit) : undefined, filter.status ? eq(proposals.status, filter.status) : undefined))
    .orderBy(desc(proposals.id))
    .all();
  return rows.map((r) => getProposal(r.id)!);
}

function requireDraft(proposalId: number): ProposalDto {
  const proposal = getProposal(proposalId);
  if (!proposal) throw new ProposalError("proposal_not_found", 404);
  if (proposal.status !== "draft") throw new ProposalError("proposal_closed", 409);
  return proposal;
}

/** I2 / I5: accept or reject a hunk, optionally replacing its text first. */
export function decideHunk(hunkId: number, patch: { decision?: Decision; editedReplace?: string | null }): HunkDto {
  const db = getDb();
  const hunk = db.select().from(proposalHunks).where(eq(proposalHunks.id, hunkId)).get();
  if (!hunk) throw new ProposalError("hunk_not_found", 404);
  requireDraft(hunk.proposalId);
  db.update(proposalHunks)
    .set({
      ...(patch.decision ? { decision: patch.decision } : {}),
      ...(patch.editedReplace !== undefined ? { editedReplace: patch.editedReplace } : {}),
    })
    .where(eq(proposalHunks.id, hunkId))
    .run();
  return getProposal(hunk.proposalId)!.hunks.find((h) => h.id === hunkId)!;
}

/** I3 / I4: apply accepted hunks as a new version, write the changelog, resolve the linked feedback. */
export function publishProposal(proposalId: number, bump: Bump): { version: string } {
  const db = getDb();
  const proposal = requireDraft(proposalId);
  const kit = requireKit(proposal.kitName);
  if (kit.currentVersion !== proposal.baseVersion) {
    throw new ProposalError(
      "stale_proposal",
      409,
      `This proposal was made for ${proposal.baseVersion}, but the current version is ${kit.currentVersion}. Regenerate it.`,
    );
  }
  if (proposal.hunks.some((h) => h.decision === "pending")) throw new ProposalError("undecided_hunks", 400, "Decide every change first.");
  const accepted = proposal.hunks.filter((h) => h.decision === "accepted");
  if (accepted.length === 0) throw new ProposalError("nothing_accepted", 400, "Accept at least one change to publish.");

  let files;
  try {
    files = applyHunks(
      filesForVersion(kit.currentVersionId),
      accepted.map((h) => ({ filePath: h.filePath, findText: h.findText, replaceText: h.editedReplace ?? h.replaceText })),
    );
  } catch (err) {
    if (err instanceof HunkConflictError) {
      throw new ProposalError("hunk_conflict", 409, `Two accepted changes overlap in ${err.filePath}. Reject one of them.`);
    }
    throw err;
  }

  const semver = nextVersion(kit.versions.map((v) => v.semver), bump);
  const changelog = accepted.map((h) => `- ${h.rationale} (${h.feedbackIds.map((id) => `#${id}`).join(", ")})`).join("\n");
  const resolvedIds = [...new Set(accepted.flatMap((h) => h.feedbackIds))];

  db.transaction(() => {
    const versionId = insertVersion(kit.id, semver, kit.currentVersionId, files, changelog);
    db.update(kits).set({ currentVersionId: versionId }).where(eq(kits.id, kit.id)).run();
    if (resolvedIds.length) {
      db.update(feedback)
        .set({ status: "resolved", resolvedInVersionId: versionId })
        .where(and(inArray(feedback.id, resolvedIds), eq(feedback.kitId, kit.id)))
        .run();
    }
    db.update(proposals).set({ status: "published" }).where(eq(proposals.id, proposalId)).run();
  });
  return { version: semver };
}
