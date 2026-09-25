import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody, parseId } from "@/lib/http";
import { RunError, setOutcome } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

const body = z.object({ outcome: z.enum(["success", "partial", "failed"]) });

/** R5: override a run's outcome. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) return fail("run_not_found", 404);
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    setOutcome(id, input.outcome);
    return ok({ id, outcome: input.outcome });
  } catch (err) {
    if (err instanceof RunError) return fail(err.code, err.status);
    throw err;
  }
}
