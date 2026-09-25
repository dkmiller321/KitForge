import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { KitError, setCurrentVersion } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

const body = z.object({ semver: z.string().min(1) });

/** Rollback / set current (K7). */
export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  try {
    const kit = setCurrentVersion((await params).name, input.semver);
    return ok({ name: kit.name, currentVersion: kit.currentVersion });
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
