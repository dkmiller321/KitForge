import { appUrl } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { withReportingStep } from "@/lib/kits/reporting";
import { KitError, getVersionFiles } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

/** Files for `kit pull`. With `report=1`, SKILL.md gets the reporting step; contentHash stays the stored version's. */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const query = new URL(req.url).searchParams;
  const version = query.get("version") || undefined;
  try {
    const kit = getVersionFiles((await params).name, version);
    if (query.get("report") !== "1") return ok(kit);
    return ok({ ...kit, files: withReportingStep(kit.files, { name: kit.name, version: kit.version, baseUrl: appUrl }) });
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
