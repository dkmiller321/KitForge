import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { QUOTE_MAX } from "@/lib/llm/schemas";
import { RunError, recordSelfReport } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

// Quotes are optional (builder-observed issues have none) and clipped rather than rejected:
// a slightly long quote must not lose the whole report.
const quote = z
  .string()
  .trim()
  .min(1)
  .transform((q) => (q.length > QUOTE_MAX ? `${q.slice(0, QUOTE_MAX - 1)}…` : q));

const body = z.object({
  session_id: z.string().min(1).max(200).optional(),
  kit: z.string().min(1),
  version: z.string().min(1),
  project_path: z.string().max(4096).default(""),
  outcome: z.enum(["success", "partial", "failed"]),
  corrections: z
    .array(z.object({ text: z.string().trim().min(1).max(2000), quote: z.union([quote, z.literal("")]).nullish().transform((q) => q || null) }))
    .max(100)
    .default([]),
  tests: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0) }).nullable().default(null),
});

/** A run reported by Claude from the kit's final step. No transcript, no LLM call. */
export async function POST(req: Request) {
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    const result = recordSelfReport({
      sessionId: input.session_id,
      kit: input.kit,
      version: input.version,
      projectPath: input.project_path,
      outcome: input.outcome,
      corrections: input.corrections,
      tests: input.tests,
    });
    const message = result.created
      ? `Reported to KitForge: run #${result.runId}, ${input.corrections.length} correction(s)`
      : `Already reported as run #${result.runId}`;
    return ok({ ...result, message }, result.created ? 201 : 200);
  } catch (err) {
    if (err instanceof RunError) return fail(err.code, err.status);
    throw err;
  }
}
