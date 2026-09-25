import { Command } from "commander";
import { CliError } from "./api";
import { installHook } from "./hook";
import { list } from "./list";
import { note } from "./note";
import { pull } from "./pull";
import { parseHookPayload, report } from "./report";

function print(text: string): void {
  if (text) process.stdout.write(`${text}\n`);
}

async function run(action: () => Promise<string> | string): Promise<void> {
  try {
    print(await action());
  } catch (err) {
    process.stderr.write(`${err instanceof CliError ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const program = new Command();
program.name("kit").description("Install KitForge kits into Claude Code and report how they did.");

program
  .command("pull")
  .description("Install a kit into ~/.claude/skills/<name>")
  .argument("<kit>", "kit name, optionally with @version")
  .action((spec: string) => run(() => pull(spec)));

program
  .command("list")
  .description("Show installed kits with installed and latest versions")
  .action(() => run(list));

program
  .command("hook")
  .description("Manage the Claude Code SessionEnd hook")
  .command("install")
  .description("Add a SessionEnd hook that runs `kit report`")
  .action(() => run(installHook));

program
  .command("report")
  .description("Report the kits a Claude Code session used (reads the SessionEnd hook payload on stdin)")
  .option("--session-id <id>", "session id")
  .option("--transcript <path>", "transcript .jsonl path")
  .option("--cwd <path>", "project path")
  .action(async (opts: { sessionId?: string; transcript?: string; cwd?: string }) => {
    // Always exit 0: a failed report must never break the Claude Code session.
    try {
      const fromStdin = parseHookPayload(await readStdin());
      const result = await report({
        sessionId: opts.sessionId ?? fromStdin.sessionId,
        transcriptPath: opts.transcript ?? fromStdin.transcriptPath,
        cwd: opts.cwd ?? fromStdin.cwd,
      });
      result.stdout.forEach(print);
      for (const line of result.stderr) process.stderr.write(`${line}\n`);
    } catch (err) {
      process.stderr.write(`kit report failed: ${String(err)}\n`);
    }
    process.exitCode = 0;
  });

program
  .command("note")
  .description("Attach a note to the most recent run")
  .argument("<text>", "note text")
  .option("--rating <n>", "rating from 1 to 5")
  .option("--kit <name>", "attach to the most recent run of this kit")
  .action((text: string, opts: { rating?: string; kit?: string }) => run(() => note(text, opts)));

await program.parseAsync(process.argv);
