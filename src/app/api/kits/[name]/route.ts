import { fail, ok } from "@/lib/http";
import { getKit } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const kit = getKit((await params).name);
  if (!kit) return fail("kit_not_found", 404);
  return ok({
    name: kit.name,
    title: kit.title,
    currentVersion: kit.currentVersion,
    versions: kit.versions.map(({ semver, contentHash, changelogMd, createdAt, isCurrent }) => ({
      semver,
      contentHash,
      changelogMd,
      createdAt,
      isCurrent,
    })),
  });
}
