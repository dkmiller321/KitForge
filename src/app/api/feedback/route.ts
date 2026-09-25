import { feedbackStatuses, type FeedbackStatus } from "@/db/schema";
import { fail, ok } from "@/lib/http";
import { listFeedback } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const status = params.get("status") || undefined;
  if (status && !(feedbackStatuses as readonly string[]).includes(status)) return fail("invalid_status", 400);
  return ok(listFeedback({ kit: params.get("kit") || undefined, status: status as FeedbackStatus | undefined }));
}
