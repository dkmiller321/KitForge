import { structuredPatch } from "diff";

export interface DiffLine {
  kind: "context" | "removed" | "added";
  text: string;
}

/** Renders one find/replace edit as unified-diff lines, with two lines of surrounding context. */
export function hunkLines(base: string, find: string, replace: string): DiffLine[] {
  const at = base.indexOf(find);
  const after = at === -1 ? replace : base.slice(0, at) + replace + base.slice(at + find.length);
  const before = at === -1 ? find : base;
  const patch = structuredPatch("a", "b", before, after, "", "", { context: 2 });
  return patch.hunks.flatMap((h) =>
    h.lines
      .filter((l) => !l.startsWith("\\"))
      .map((l): DiffLine => ({ kind: l[0] === "-" ? "removed" : l[0] === "+" ? "added" : "context", text: l.slice(1) })),
  );
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified";
  patch: string;
}

/** K6: unified diffs for every file that differs between two versions. */
export function versionDiff(from: { path: string; content: string }[], to: { path: string; content: string }[]): FileDiff[] {
  const a = new Map(from.map((f) => [f.path, f.content]));
  const b = new Map(to.map((f) => [f.path, f.content]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: FileDiff[] = [];
  for (const path of paths) {
    const oldText = a.get(path);
    const newText = b.get(path);
    if (oldText === newText) continue;
    const status = oldText === undefined ? "added" : newText === undefined ? "removed" : "modified";
    const patch = createTwoFilesPatchText(path, oldText ?? "", newText ?? "");
    out.push({ path, status, patch });
  }
  return out;
}

function createTwoFilesPatchText(path: string, oldText: string, newText: string): string {
  const patch = structuredPatch(`a/${path}`, `b/${path}`, oldText, newText, "", "", { context: 3 });
  const header = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
  const body = patch.hunks
    .map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n${h.lines.join("\n")}\n`)
    .join("");
  return header + body;
}
