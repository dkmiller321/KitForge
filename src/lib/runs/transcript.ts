// Pure transcript helpers shared by the CLI and unit tests. No imports from app code.

export interface TranscriptLine {
  type?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

interface Block {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

export const TOOL_RESULT_MAX = 2000;
export const TRANSCRIPT_MAX = 600_000;
export const TRIM_MARKER = "\n[... trimmed ...]\n";

export function parseTranscript(jsonl: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const raw of jsonl.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") lines.push(parsed as TranscriptLine);
    } catch {
      // A transcript can end with a partially written line; skip it.
    }
  }
  return lines;
}

function blocks(content: unknown): Block[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content.filter((b) => b && typeof b === "object") as Block[]) : [];
}

const SKILL_READ = /\/\.claude\/skills\/([^/]+)\/SKILL\.md$/;

/** Kit names whose SKILL.md was read by an assistant `Read` tool call, in first-seen order. */
export function detectKits(lines: TranscriptLine[]): string[] {
  const names: string[] = [];
  for (const line of lines) {
    if (line.type !== "assistant") continue;
    for (const block of blocks(line.message?.content)) {
      if (block.type !== "tool_use" || block.name !== "Read") continue;
      const filePath = (block.input as { file_path?: unknown } | undefined)?.file_path;
      if (typeof filePath !== "string") continue;
      const name = SKILL_READ.exec(filePath.replace(/\\/g, "/"))?.[1];
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

export function sessionTimes(lines: TranscriptLine[]): { startedAt: string; endedAt: string } | null {
  const stamps = lines.map((l) => l.timestamp).filter((t): t is string => typeof t === "string");
  if (stamps.length === 0) return null;
  return { startedAt: stamps[0], endedAt: stamps[stamps.length - 1] };
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  return blocks(content)
    .map((b) => (typeof b.text === "string" ? b.text : ""))
    .join("\n");
}

/** User text, assistant text and tool calls; long tool results truncated; whole string capped. */
export function trimTranscript(lines: TranscriptLine[]): string {
  const out: string[] = [];
  for (const line of lines) {
    if (line.type !== "user" && line.type !== "assistant") continue;
    for (const block of blocks(line.message?.content)) {
      if (block.type === "text" && typeof block.text === "string") {
        out.push(`[${line.type}] ${block.text}`);
      } else if (block.type === "tool_use") {
        out.push(`[tool_use ${block.name ?? "?"}] ${JSON.stringify(block.input ?? {})}`);
      } else if (block.type === "tool_result") {
        const body = toolResultText(block.content);
        out.push(`[tool_result] ${body.length > TOOL_RESULT_MAX ? `[truncated ${body.length} chars]` : body}`);
      }
    }
  }
  const text = out.join("\n");
  if (text.length <= TRANSCRIPT_MAX) return text;
  const keep = TRANSCRIPT_MAX - TRIM_MARKER.length;
  const head = Math.ceil(keep / 2);
  return text.slice(0, head) + TRIM_MARKER + text.slice(text.length - (keep - head));
}
