import { ok } from "@/lib/http";
import { listKits } from "@/lib/kits/service";

export const dynamic = "force-dynamic";

export function GET() {
  return ok(listKits());
}
