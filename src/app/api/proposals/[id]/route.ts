import { fail, ok, parseId } from "@/lib/http";
import { getProposal } from "@/lib/proposals/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const proposal = id === null ? null : getProposal(id);
  if (!proposal) return fail("proposal_not_found", 404);
  return ok(proposal);
}
