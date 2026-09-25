// Starts `next dev` or `next start` bound to KITFORGE_HOST:KITFORGE_PORT.
// Values already in the environment win over .env (Playwright sets them).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

if (existsSync(".env")) process.loadEnvFile(".env");

const mode = process.argv[2] === "start" ? "start" : "dev";
const host = process.env.KITFORGE_HOST || "127.0.0.1";
const port = process.env.KITFORGE_PORT || "4317";
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const args = [nextBin, mode, "-H", host, "-p", port];
if (mode === "dev") args.push("--turbopack");

const child = spawn(process.execPath, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
