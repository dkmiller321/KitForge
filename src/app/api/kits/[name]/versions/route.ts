import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { BUMPS } from "@/lib/kits/semver";
import { KitError, createManualVersion } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

const body = z.object({
  files: z.array(z.object({ path: z.string().min(1), content: z.string().max(2 * 1024 * 1024) })).min(1),
  changelog: z.string().max(2000).default(""),
  bump: z.enum(BUMPS).default("patch"),
});

/** K8: save an in-browser edit as a new version on top of the current one. */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    const kit = createManualVersion((await params).name, input.files, input.changelog, input.bump);
    return ok({ name: kit.name, currentVersion: kit.currentVersion }, 201);
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
