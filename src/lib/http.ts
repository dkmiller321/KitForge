import { NextResponse } from "next/server";
import type { z } from "zod";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(code: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export function methodNotAllowed(): NextResponse {
  return fail("method_not_allowed", 405);
}

/** Parses a JSON body against a schema; returns the data or a 400 response. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_json", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail("invalid_input", 400, { issues: parsed.error.issues.map((i) => i.message) });
  return parsed.data;
}

export function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}
