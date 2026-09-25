import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { KitError } from "@/lib/kits/service";
import { ProposalError, createProposal } from "@/lib/proposals/service";

export const dynamic = "force-dynamic";

const body = z.object({ instruction: z.string().max(2000).optional() });

/** I1 / I6: generate (or regenerate) a proposal from the kit's latest insights. */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    const proposal = await createProposal((await params).name, { instruction: input.instruction });
    return ok(proposal, 201);
  } catch (err) {
    if (err instanceof ProposalError || err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
