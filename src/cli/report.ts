import fs from "node:fs";
import path from "node:path";
import { detectKits, parseTranscript, sessionTimes, trimTranscript } from "../lib/runs/transcript";
import { readManifest } from "./api";
import { baseUrl, cliEnv } from "./env";
import { outboxDir } from "./paths";

export interface ReportInput {
  sessionId?: string;
  transcriptPath?: string;
  cwd?: string;
}

interface RunReport {
  session_id: string;
  kit: string;
  version: string;
  project_path: string;
  started_at: string;
  ended_at: string;
  transcript: string;
}

type SendResult = { kind: "sent"; created: boolean } | { kind: "retry" } | { kind: "rejected"; status: number };

export function parseHookPayload(stdin: string): ReportInput {
  if (!stdin.trim()) return {};
  try {
    const payload = JSON.parse(stdin) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return { sessionId: str(payload.session_id), transcriptPath: str(payload.transcript_path), cwd: str(payload.cwd) };
  } catch {
    return {};
  }
}

async function send(report: RunReport, deadline: number): Promise<SendResult> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return { kind: "retry" };
  try {
    const res = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(remaining),
    });
    if (res.ok) return { kind: "sent", created: ((await res.json()) as { created?: boolean }).created === true };
    // 4xx can never succeed on retry (unknown kit or version, bad payload); 5xx and network errors can.
    return res.status >= 500 ? { kind: "retry" } : { kind: "rejected", status: res.status };
  } catch {
    return { kind: "retry" };
  }
}

function queue(report: RunReport): void {
  const dir = outboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${report.session_id}-${report.kit}`.replace(/[^A-Za-z0-9._-]/g, "_");
  fs.writeFileSync(path.join(dir, `${Date.now()}-${safe}.json`), JSON.stringify(report), "utf8");
}

async function flushOutbox(deadline: number, out: string[], err: string[]): Promise<{ created: number }> {
  const dir = outboxDir();
  if (!fs.existsSync(dir)) return { created: 0 };
  let flushed = 0;
  let created = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const full = path.join(dir, file);
    let report: RunReport;
    try {
      report = JSON.parse(fs.readFileSync(full, "utf8")) as RunReport;
    } catch {
      fs.rmSync(full, { force: true });
      err.push(`Discarded unreadable queued report ${file}`);
      continue;
    }
    const result = await send(report, deadline);
    if (result.kind === "retry") continue;
    fs.rmSync(full, { force: true });
    if (result.kind === "rejected") {
      err.push(`Discarded queued report for ${report.kit} (KitForge returned ${result.status})`);
      continue;
    }
    flushed++;
    if (result.created) created++;
  }
  if (flushed > 0) out.push(`Flushed ${flushed} queued report(s)`);
  return { created };
}

/** Never throws: every failure path either queues the report or explains itself on stderr. */
export async function report(input: ReportInput): Promise<{ stdout: string[]; stderr: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const deadline = Date.now() + cliEnv.KITFORGE_REPORT_TIMEOUT_MS;

  await flushOutbox(deadline, out, err);

  if (!input.transcriptPath || !fs.existsSync(input.transcriptPath)) {
    out.push("No transcript to report");
    return { stdout: out, stderr: err };
  }
  const lines = parseTranscript(fs.readFileSync(input.transcriptPath, "utf8"));
  const kits = detectKits(lines)
    .map(readManifest)
    .filter((m) => m !== null);
  if (kits.length === 0) {
    out.push("No kits used");
    return { stdout: out, stderr: err };
  }

  const times = sessionTimes(lines);
  const now = new Date().toISOString();
  const transcript = trimTranscript(lines);
  const sessionId = input.sessionId ?? path.basename(input.transcriptPath, path.extname(input.transcriptPath));

  let answered = 0;
  let created = 0;
  let queued = 0;
  for (const kit of kits) {
    const body: RunReport = {
      session_id: sessionId,
      kit: kit.name,
      version: kit.version,
      project_path: input.cwd ?? process.cwd(),
      started_at: times?.startedAt ?? now,
      ended_at: times?.endedAt ?? now,
      transcript,
    };
    const result = await send(body, deadline);
    if (result.kind === "sent") {
      answered++;
      if (result.created) created++;
    } else if (result.kind === "retry") {
      queue(body);
      queued++;
    } else {
      err.push(`KitForge rejected the report for ${kit.name}@${kit.version} (${result.status})`);
    }
  }
  if (answered > 0) out.push(`Reported ${created} run(s)`);
  if (queued > 0) out.push(`Queued ${queued} report(s)`);
  return { stdout: out, stderr: err };
}
