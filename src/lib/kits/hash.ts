import { createHash } from "node:crypto";

export interface FileEntry {
  path: string;
  content: string;
}

export function sortFiles<T extends { path: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** sha256 hex over files sorted by path, each as `path\n` + content + `\n`. */
export function contentHash(files: FileEntry[]): string {
  const hash = createHash("sha256");
  for (const file of sortFiles(files)) hash.update(`${file.path}\n${file.content}\n`);
  return hash.digest("hex");
}
