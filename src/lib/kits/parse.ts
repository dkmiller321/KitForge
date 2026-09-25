import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import type { FileEntry } from "./hash";

export const MAX_FILES = 50;
export const MAX_BYTES = 2 * 1024 * 1024;

const IGNORED = [/(^|\/)__MACOSX(\/|$)/, /(^|\/)\.DS_Store$/, /(^|\/)\.git(\/|$)/, /(^|\/)node_modules(\/|$)/, /^\.kitforge\.json$/];

export class KitImportError extends Error {
  constructor(
    readonly code: "no_skill_md" | "too_large" | "invalid_name" | "invalid_path" | "invalid_zip",
    message: string,
  ) {
    super(message);
  }
}

export interface ParsedKit {
  name: string;
  title: string;
  files: FileEntry[];
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isKitName(name: string): boolean {
  return NAME_RE.test(name);
}

function frontmatterName(skillMd: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
  const line = fm?.[1].split(/\r?\n/).find((l) => /^name\s*:/.test(l));
  return line?.replace(/^name\s*:\s*/, "").replace(/^["']|["']$/g, "").trim() || undefined;
}

function heading(skillMd: string): string | undefined {
  return /^#\s+(.+)$/m.exec(skillMd)?.[1].trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Validates the file set, strips a single wrapping folder, and derives name and title from SKILL.md. */
export function kitFromEntries(entries: FileEntry[], fallbackName: string): ParsedKit {
  let files = entries
    .map((e) => ({ path: e.path.replace(/\\/g, "/").replace(/^\/+/, ""), content: e.content }))
    .filter((e) => e.path && !IGNORED.some((re) => re.test(e.path)));

  let folderName = fallbackName;
  if (!files.some((f) => f.path === "SKILL.md")) {
    const tops = new Set(files.map((f) => f.path.split("/")[0]));
    const [top] = [...tops];
    if (tops.size === 1 && files.every((f) => f.path.includes("/")) && files.some((f) => f.path === `${top}/SKILL.md`)) {
      files = files.map((f) => ({ path: f.path.slice(top.length + 1), content: f.content }));
      folderName = top;
    }
  }

  const skill = files.find((f) => f.path === "SKILL.md");
  if (!skill) throw new KitImportError("no_skill_md", "No SKILL.md found");
  if (files.length > MAX_FILES) throw new KitImportError("too_large", `A kit can have at most ${MAX_FILES} files.`);
  const bytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, "utf8"), 0);
  if (bytes > MAX_BYTES) throw new KitImportError("too_large", "A kit can be at most 2 MB.");

  const name = frontmatterName(skill.content) ?? slugify(folderName);
  if (!isKitName(name)) {
    throw new KitImportError("invalid_name", `Kit name "${name}" must use lowercase letters, digits and dashes.`);
  }
  return { name, title: heading(skill.content) ?? name, files };
}

export function readZip(buffer: Buffer): FileEntry[] {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new KitImportError("invalid_zip", "That file is not a valid zip.");
  }
  return zip
    .getEntries()
    .filter((e) => !e.isDirectory)
    .map((e) => ({ path: e.entryName, content: e.getData().toString("utf8") }));
}

export function readFolder(dir: string): FileEntry[] {
  if (!path.isAbsolute(dir) || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new KitImportError("invalid_path", "Enter the absolute path of a folder on this machine.");
  }
  const out: FileEntry[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (IGNORED.some((re) => re.test(relPath))) continue;
      if (entry.isDirectory()) walk(relPath);
      else if (entry.isFile()) out.push({ path: relPath, content: fs.readFileSync(path.join(dir, relPath), "utf8") });
      if (out.length > MAX_FILES) throw new KitImportError("too_large", `A kit can have at most ${MAX_FILES} files.`);
    }
  };
  walk("");
  return out;
}
