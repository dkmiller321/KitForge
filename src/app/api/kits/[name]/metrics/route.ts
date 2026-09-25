import { fail, ok } from "@/lib/http";
import { KitError, kitMetrics } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

/** M1: per-version runs, success rate and corrections per run, newest version first. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    return ok(kitMetrics((await params).name));
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
