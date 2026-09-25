import fs from "node:fs";
import { baseUrl } from "./env";
import { manifestPath } from "./paths";

export class CliError extends Error {}

export async function request(pathname: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${baseUrl}${pathname}`, init);
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw err;
    throw new CliError(`Cannot reach KitForge at ${baseUrl}. Is it running?`);
  }
}

export async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

export interface Manifest {
  name: string;
  version: string;
  hash: string;
}

export function readManifest(name: string): Manifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath(name), "utf8")) as Partial<Manifest>;
    if (typeof parsed.name !== "string" || typeof parsed.version !== "string") return null;
    return { name: parsed.name, version: parsed.version, hash: String(parsed.hash ?? "") };
  } catch {
    return null;
  }
}
