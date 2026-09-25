import AdmZip from "adm-zip";
import { appUrl } from "@/lib/env";
import { fail } from "@/lib/http";
import { withReportingStep } from "@/lib/kits/reporting";
import { KitError, getVersionFiles } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

/** A zip of one version (current by default) with the reporting step added, ready to upload to Claude as a skill. */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const version = new URL(req.url).searchParams.get("version") || undefined;
  try {
    const kit = getVersionFiles((await params).name, version);
    const files = withReportingStep(kit.files, { name: kit.name, version: kit.version, baseUrl: appUrl });
    const zip = new AdmZip();
    for (const f of files) zip.addFile(`${kit.name}/${f.path}`, Buffer.from(f.content, "utf8"));
    return new Response(new Uint8Array(zip.toBuffer()), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${kit.name}-${kit.version}.zip"`,
      },
    });
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
