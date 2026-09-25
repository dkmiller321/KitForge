import fs from "node:fs";
import path from "node:path";
import { CliError, errorCode, request } from "./api";
import { skillDir } from "./paths";

interface FilesResponse {
  name: string;
  version: string;
  contentHash: string;
  files: { path: string; content: string }[];
}

export async function pull(spec: string): Promise<string> {
  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : undefined;

  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  const res = await request(`/api/kits/${encodeURIComponent(name)}/files${query}`);
  if (!res.ok) {
    const code = await errorCode(res);
    if (code === "version_not_found") throw new CliError(`Version not found: ${name}@${version}`);
    if (res.status === 404) throw new CliError(`Kit not found: ${name}`);
    throw new CliError(`KitForge returned ${res.status}${code ? ` (${code})` : ""}`);
  }
  const body = (await res.json()) as FilesResponse;

  const dir = skillDir(body.name);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const file of body.files) {
    const target = path.join(dir, ...file.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
  const manifest = { name: body.name, version: body.version, hash: body.contentHash };
  fs.writeFileSync(path.join(dir, ".kitforge.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return `Installed ${body.name}@${body.version} to ${dir}`;
}
