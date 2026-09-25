import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/http";
import { isKitName } from "@/lib/kits/parse";
import { KitError, createBlankKit, listKits } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listKits());
}

const body = z.object({ name: z.string().trim().min(1).max(80) });

/** K8: create a blank kit (a starter SKILL.md) at 1.0.0. */
export async function POST(req: Request) {
  const input = await parseBody(req, body);
  if (input instanceof NextResponse) return input;
  if (!isKitName(input.name)) {
    return fail("invalid_name", 400, { message: "Use lowercase letters, digits and dashes, e.g. review-kit." });
  }
  try {
    const kit = createBlankKit(input.name);
    return ok({ name: kit.name, version: kit.currentVersion }, 201);
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status, { message: err.message });
    throw err;
  }
}
