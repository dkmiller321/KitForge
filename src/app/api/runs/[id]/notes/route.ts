import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody, parseId } from "@/lib/http";
import { RunError, addNote } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

const body = z.object({
  text: z.string().trim().min(1).max(2000),
  rating: z.number().int().min(1).max(5).nullish(),
});

/** L5 / U5: manual feedback on a run. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  if (id === null) return fail("run_not_found", 404);
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    return ok({ id: addNote(id, input.text, input.rating ?? null) }, 201);
  } catch (err) {
    if (err instanceof RunError) return fail(err.code, err.status);
    throw err;
  }
}
