import { fail, methodNotAllowed, ok } from "@/lib/http";
import { KitError, getVersionFiles } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string; semver: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { name, semver } = await params;
  try {
    return ok(getVersionFiles(name, semver));
  } catch (err) {
    if (err instanceof KitError) return fail(err.code, err.status);
    throw err;
  }
}

// Versions are immutable (K4): nothing may update or delete one.
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
