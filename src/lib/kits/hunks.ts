import type { FileEntry } from "./hash";

export interface EditInput {
  file: string;
  find: string;
  replace: string;
  rationale: string;
  feedback_ids: number[];
}

export interface HunkDraft {
  filePath: string;
  findText: string;
  replaceText: string;
  rationale: string;
  feedbackIds: number[];
}

export interface HunkToApply {
  filePath: string;
  findText: string;
  replaceText: string;
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) count++;
  return count;
}

/** Keeps edits whose find text occurs exactly once in its base file; counts the rest as dropped. */
export function editsToHunks(files: FileEntry[], edits: EditInput[]): { hunks: HunkDraft[]; dropped: number } {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const hunks: HunkDraft[] = [];
  let dropped = 0;
  for (const edit of edits) {
    const content = byPath.get(edit.file);
    if (content === undefined || countOccurrences(content, edit.find) !== 1 || edit.find === edit.replace) {
      dropped++;
      continue;
    }
    hunks.push({
      filePath: edit.file,
      findText: edit.find,
      replaceText: edit.replace,
      rationale: edit.rationale,
      feedbackIds: edit.feedback_ids,
    });
  }
  return { hunks, dropped };
}

export class HunkConflictError extends Error {
  readonly code = "hunk_conflict";
  constructor(readonly filePath: string) {
    super(`hunk_conflict: ${filePath}`);
  }
}

/** Applies hunks in order to a copy of the files. A find that is not unique at apply time raises hunk_conflict. */
export function applyHunks(files: FileEntry[], hunks: HunkToApply[]): FileEntry[] {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  for (const hunk of hunks) {
    const content = byPath.get(hunk.filePath);
    if (content === undefined || countOccurrences(content, hunk.findText) !== 1) {
      throw new HunkConflictError(hunk.filePath);
    }
    const at = content.indexOf(hunk.findText);
    byPath.set(hunk.filePath, content.slice(0, at) + hunk.replaceText + content.slice(at + hunk.findText.length));
  }
  return [...byPath.entries()].map(([path, content]) => ({ path, content }));
}
