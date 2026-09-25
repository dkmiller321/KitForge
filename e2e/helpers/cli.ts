import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_URL = process.env.BASE_URL ?? "http://127.0.0.1:4317";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CLI_ENTRY = path.join(ROOT, "src", "cli", "index.ts");

export interface KitResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

export function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kitforge-home-"));
}

/**
 * Runs the CLI (`tsx src/cli/index.ts ...args`) with HOME pointed at `opts.home`.
 * tsx is started with the current node binary rather than through `npx` so the call
 * behaves the same on Windows; USERPROFILE is set too because os.homedir() reads it on Windows.
 */
export function runKit(
  args: string[],
  opts: { home: string; stdin?: string; env?: Record<string, string> },
): Promise<KitResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, CLI_ENTRY, ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: opts.home,
        USERPROFILE: opts.home,
        KITFORGE_URL: APP_URL,
        KITFORGE_REPORT_TIMEOUT_MS: "10000",
        ...opts.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ code: code ?? -1, stdout: stdout.replace(/\r\n/g, "\n"), stderr: stderr.replace(/\r\n/g, "\n"), ms: Date.now() - started }),
    );
    child.stdin.end(opts.stdin ?? "");
  });
}
