import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody, parseId } from "@/lib/http";
import { FeedbackError, triageFeedback } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

const body = z
  .object({
    status: z.enum(["new", "accepted", "dismissed"]).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
  })
  .refine((b) => b.status !== undefined || b.tags !== undefined, "status or tags required");

/** T2: triage one item. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) return fail("feedback_not_found", 404);
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    return ok(triageFeedback(id, input));
  } catch (err) {
    if (err instanceof FeedbackError) return fail(err.code, err.status);
    throw err;
  }
}
