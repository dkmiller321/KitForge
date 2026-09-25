import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { FeedbackError, mergeFeedback } from "@/lib/feedback/service";

export const dynamic = "force-dynamic";

const body = z.object({ ids: z.array(z.number().int().positive()).min(2) });

/** T3: merge duplicates into the first id. */
export async function POST(req: Request) {
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    return ok(mergeFeedback(input.ids));
  } catch (err) {
    if (err instanceof FeedbackError) return fail(err.code, err.status);
    throw err;
  }
}
