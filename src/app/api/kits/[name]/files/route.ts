import { fail, ok } from "@/lib/http";
import { KitError, getVersionFiles } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const version = new URL(req.url).searchParams.get("version") || undefined;
  try {
    return ok(getVersionFiles((await params).name, version));
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}
