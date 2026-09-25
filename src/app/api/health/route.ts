import { getDb } from "@/db";
import { env } from "@/lib/env";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET() {
  getDb();
  return ok({ ok: true, llmMode: env.KITFORGE_LLM_MODE });
}
