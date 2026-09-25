import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody, parseId } from "@/lib/http";
import { BUMPS } from "@/lib/kits/semver";
import { KitError } from "@/lib/kits/service";
import { ProposalError, publishProposal } from "@/lib/proposals/service";

export const dynamic = "force-dynamic";

const body = z.object({ bump: z.enum(BUMPS).default("minor") });

/** I3 / I4: publish accepted hunks as a new version. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) return fail("proposal_not_found", 404);
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    return ok(publishProposal(id, input.bump), 201);
  } catch (err) {
    if (err instanceof ProposalError || err instanceof KitError) return fail(err.code, err.status, { message: err.message });
    throw err;
  }
}
