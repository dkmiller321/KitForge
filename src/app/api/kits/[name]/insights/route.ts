import { fail, ok } from "@/lib/http";
import { InsightsError, analyzeKit, getLatestInsights } from "@/lib/insights/service";
import { KitError } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

/** The kit's current insights, or null before the first analysis. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    return ok(getLatestInsights((await params).name));
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}

/** A1: analyse all of the kit's feedback into ranked themes. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    return ok(await analyzeKit((await params).name), 201);
  } catch (err) {
    if (err instanceof InsightsError || err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
