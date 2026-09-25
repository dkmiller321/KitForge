import { fail, ok } from "@/lib/http";
import { listProposals, type ProposalDto } from "@/lib/proposals/service";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "published", "discarded"];

export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const status = params.get("status") || undefined;
  if (status && !STATUSES.includes(status)) return fail("invalid_status", 400);
  return ok(listProposals({ kit: params.get("kit") || undefined, status: status as ProposalDto["status"] | undefined }));
}
