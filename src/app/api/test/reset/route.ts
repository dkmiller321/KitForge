import { resetDb } from "@/db";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Test-only: wipes every table. Exists only in mock mode. */
export function POST() {
  if (env.KITFORGE_LLM_MODE !== "mock") return fail("not_found", 404);
  resetDb();
  return ok({ ok: true });
}
