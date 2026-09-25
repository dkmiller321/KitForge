import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { RunError, listRuns, recordRun } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

const TRANSCRIPT_LIMIT = 5 * 1024 * 1024;

const reportSchema = z.object({
  session_id: z.string().min(1).max(200),
  kit: z.string().min(1),
  version: z.string().min(1),
  project_path: z.string().max(4096),
  started_at: z.string().min(1),
  ended_at: z.string().min(1),
  transcript: z.string().max(TRANSCRIPT_LIMIT),
});

export function GET(req: Request) {
  const kit = new URL(req.url).searchParams.get("kit") || undefined;
  return ok(listRuns(kit));
}

export async function POST(req: Request) {
  const input = await parseBody(req, reportSchema);
  if (input instanceof NextResponse) return input;
  try {
    const result = await recordRun({
      sessionId: input.session_id,
      kit: input.kit,
      version: input.version,
      projectPath: input.project_path,
      startedAt: input.started_at,
      endedAt: input.ended_at,
      transcript: input.transcript,
    });
    return ok(result, result.created ? 201 : 200);
  } catch (err) {
    if (err instanceof RunError) return fail(err.code, err.status);
    throw err;
  }
}
