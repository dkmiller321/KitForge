import fs from "node:fs";
import { readManifest, request } from "./api";
import { skillsDir } from "./paths";

async function latestVersion(name: string): Promise<string> {
  try {
    const res = await request(`/api/kits/${encodeURIComponent(name)}`);
    if (!res.ok) return "unknown";
    return ((await res.json()) as { currentVersion: string }).currentVersion;
  } catch {
    return "unknown";
  }
}

export async function list(): Promise<string> {
  const dir = skillsDir();
  const names = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
  const manifests = names.map(readManifest).filter((m) => m !== null);
  if (manifests.length === 0) return "No kits installed";
  const lines = await Promise.all(
    manifests.map(async (m) => `${m.name} ${m.version} (latest ${await latestVersion(m.name)})`),
  );
  return lines.join("\n");
}
