import { ok } from "@/lib/http";
import { countNewFeedback } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

/** Number of open feedback items (the nav badge). */
export function GET() {
  return ok({ open: countNewFeedback() });
}
