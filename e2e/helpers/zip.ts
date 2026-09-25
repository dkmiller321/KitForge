import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** Zips a folder. With `prefix`, every entry sits inside that top-level folder. */
export function zipFolder(dir: string, prefix = ""): Buffer {
  const zip = new AdmZip();
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relPath);
      else zip.addFile(prefix ? `${prefix}/${relPath}` : relPath, fs.readFileSync(path.join(dir, relPath)));
    }
  };
  walk("");
  return zip.toBuffer();
}

export type FixtureZip = "debug-kit.zip" | "debug-kit-nested.zip" | "invalid-kit.zip";

/** Builds a fixture zip at test time and returns its path. */
export function fixtureZip(name: FixtureZip): string {
  const buffer =
    name === "debug-kit.zip"
      ? zipFolder(path.join(FIXTURES, "debug-kit"))
      : name === "debug-kit-nested.zip"
        ? zipFolder(path.join(FIXTURES, "debug-kit"), "debug-kit")
        : zipFolder(path.join(FIXTURES, "invalid-kit"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kitforge-zip-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, buffer);
  return file;
}
