import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { insights, kitVersions } from "@/db/schema";
import { listFeedback } from "@/lib/feedback/service";
import { filesForVersion, requireKit } from "@/lib/kits/service";
import { getLlm } from "@/lib/llm";
import type { Theme } from "@/lib/llm/schemas";

export class InsightsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export interface InsightsDto {
  id: number;
  kitName: string;
  /** Version that was current when the analysis ran. */
  version: string;
  createdAt: string;
  feedbackCount: number;
  themes: Theme[];
  /** Feedback that arrived after this analysis and isn't reflected in it. */
  newFeedbackCount: number;
  /** True when there is newer feedback or a newer current version than the analysis saw. */
  stale: boolean;
}

/** Every item worth analysing: open and resolved feedback. Dismissed items are noise; merged items live on in their target. */
function analysableFeedback(kitName: string) {
  return listFeedback({ kit: kitName }).filter((f) => f.status !== "dismissed" && f.status !== "merged");
}

/** Reads all of the kit's feedback, asks the LLM for ranked themes and stores them as the kit's current insights. */
export async function analyzeKit(kitName: string): Promise<InsightsDto> {
  const kit = requireKit(kitName);
  const feedback = analysableFeedback(kit.name);
  if (feedback.length === 0) throw new InsightsError("no_feedback", 400);

  let result;
  try {
    result = await getLlm().analyzeFeedback({
      kit: kit.name,
      version: kit.currentVersion,
      files: filesForVersion(kit.currentVersionId),
      feedback: feedback.map((f) => ({
        id: f.id,
        kind: f.kind,
        text: f.text,
        quote: f.quote,
        rating: f.rating,
        status: f.status === "accepted" ? "new" : f.status,
        runCount: f.runIds.length,
        resolvedInVersion: f.resolvedInVersion,
      })),
    });
  } catch (err) {
    // Log the cause (never request content or keys) so a failed LLM call can be diagnosed.
    console.error(`[kitforge] analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    throw new InsightsError("analysis_failed", 502);
  }

  // Themes may only cite feedback that was actually analysed.
  const known = new Set(feedback.map((f) => f.id));
  const themes = result.themes
    .map((t) => ({ ...t, feedback_ids: [...new Set(t.feedback_ids.filter((id) => known.has(id)))] }))
    .filter((t) => t.feedback_ids.length > 0);

  getDb()
    .insert(insights)
    .values({ kitId: kit.id, versionId: kit.currentVersionId, feedbackIds: [...known], themes })
    .run();
  return getLatestInsights(kit.name)!;
}

export function getLatestInsights(kitName: string): InsightsDto | null {
  const kit = requireKit(kitName);
  const row = getDb()
    .select({
      id: insights.id,
      version: kitVersions.semver,
      versionId: insights.versionId,
      createdAt: insights.createdAt,
      feedbackIds: insights.feedbackIds,
      themes: insights.themes,
    })
    .from(insights)
    .innerJoin(kitVersions, eq(kitVersions.id, insights.versionId))
    .where(eq(insights.kitId, kit.id))
    .orderBy(desc(insights.id))
    .get();
  if (!row) return null;
  const seen = new Set(row.feedbackIds);
  const newFeedbackCount = analysableFeedback(kit.name).filter((f) => !seen.has(f.id) && f.status !== "resolved").length;
  return {
    id: row.id,
    kitName: kit.name,
    version: row.version,
    createdAt: row.createdAt,
    feedbackCount: row.feedbackIds.length,
    themes: row.themes,
    newFeedbackCount,
    stale: newFeedbackCount > 0 || row.versionId !== kit.currentVersionId,
  };
}
