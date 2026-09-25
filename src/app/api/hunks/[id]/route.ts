import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody, parseId } from "@/lib/http";
import { ProposalError, decideHunk } from "@/lib/proposals/service";

export const dynamic = "force-dynamic";

const body = z
  .object({
    decision: z.enum(["pending", "accepted", "rejected"]).optional(),
    edited_replace: z.string().max(200_000).nullable().optional(),
  })
  .refine((b) => b.decision !== undefined || b.edited_replace !== undefined, "decision or edited_replace required");

/** I2 / I5: review one hunk. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) return fail("hunk_not_found", 404);
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    return ok(decideHunk(id, { decision: input.decision, editedReplace: input.edited_replace }));
  } catch (err) {
    if (err instanceof ProposalError) return fail(err.code, err.status);
    throw err;
  }
}
