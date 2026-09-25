import { fail, ok } from "@/lib/http";
import { versionDiff } from "@/lib/kits/render";
import { KitError, filesForVersion, requireKit } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

/** K6: file-by-file unified diff between two versions (`?from=1.0.0&to=1.1.0`). */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const query = new URL(req.url).searchParams;
  try {
    const kit = requireKit((await params).name);
    const from = kit.versions.find((v) => v.semver === query.get("from"));
    const to = kit.versions.find((v) => v.semver === query.get("to"));
    if (!from || !to) return fail("version_not_found", 404);
    return ok({ from: from.semver, to: to.semver, files: versionDiff(filesForVersion(from.id), filesForVersion(to.id)) });
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
