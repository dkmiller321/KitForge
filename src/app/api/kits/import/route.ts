import path from "node:path";
import { fail, ok } from "@/lib/http";
import { KitImportError, kitFromEntries, readFolder, readZip, MAX_BYTES } from "@/lib/kits/parse";
import { KitError, importKit } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

/** Multipart: `file` (a zip) or `path` (absolute folder path on this machine). */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("invalid_input", 400, { message: "Choose a zip file or enter a folder path." });
  }
  const file = form.get("file");
  const folder = form.get("path");

  try {
    let parsed;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES * 2) throw new KitImportError("too_large", "A kit can be at most 2 MB.");
      const entries = readZip(Buffer.from(await file.arrayBuffer()));
      parsed = kitFromEntries(entries, file.name.replace(/\.zip$/i, ""));
    } else if (typeof folder === "string" && folder.trim()) {
      const dir = folder.trim();
      parsed = kitFromEntries(readFolder(dir), path.basename(dir));
    } else {
      return fail("invalid_input", 400, { message: "Choose a zip file or enter a folder path." });
    }
    const kit = importKit(parsed);
    return ok({ name: kit.name, version: kit.currentVersion }, 201);
  } catch (err) {
    if (err instanceof KitImportError) return fail(err.code, 400, { message: err.message });
    if (err instanceof KitError) return fail(err.code, err.status, { message: err.message });
    throw err;
  }
}
