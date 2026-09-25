import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import { detectKits, parseTranscript } from "../src/lib/runs/transcript";
import { TRANSCRIPTS, writeTranscript } from "./helpers/transcript";
import { fixtureZip } from "./helpers/zip";

// Real Claude API. Skipped unless RUN_SMOKE=1, KITFORGE_LLM_MODE=real and ANTHROPIC_API_KEY are set.
// /api/test/reset is unavailable in real mode, so this suite starts its own server on a temp DB.
const enabled =
  process.env.RUN_SMOKE === "1" && process.env.KITFORGE_LLM_MODE === "real" && !!process.env.ANTHROPIC_API_KEY;
const PORT = "4318";
const URL = `http://127.0.0.1:${PORT}`;

test.describe.configure({ mode: "serial" });
test.skip(!enabled, "Set RUN_SMOKE=1, KITFORGE_LLM_MODE=real and ANTHROPIC_API_KEY to run the smoke suite");

let server: ChildProcess | undefined;
const home = tmpHome();

async function waitForHealth(timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${URL}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("smoke server did not start");
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kitforge-smoke-")), "smoke.db");
  server = spawn(process.execPath, ["scripts/serve.mjs", "dev"], {
    env: { ...process.env, KITFORGE_LLM_MODE: "real", KITFORGE_PORT: PORT, KITFORGE_DB_PATH: dbPath },
    stdio: "ignore",
  });
  await waitForHealth(180_000);
});

test.afterAll(() => {
  server?.kill();
});

const kit = (args: string[], stdin?: string) => runKit(args, { home, stdin, env: { KITFORGE_URL: URL, KITFORGE_REPORT_TIMEOUT_MS: "60000" } });

test("SMOKE-1 @smoke extraction", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.goto(`${URL}/`);
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-file").setInputFiles(fixtureZip("debug-kit.zip"));
  await page.getByTestId("import-submit").click();
  await expect(page.locator('[data-testid="kit-card"][data-kit-name="debug-kit"]')).toBeVisible();
  expect((await kit(["pull", "debug-kit"])).code).toBe(0);

  const file = writeTranscript(home, "smoke.jsonl", [...TRANSCRIPTS["transcript-real-smoke.jsonl"]]);
  const reported = await kit(
    ["report"],
    JSON.stringify({ session_id: "smoke-001", transcript_path: file, cwd: "/tmp/proj-smoke", hook_event_name: "SessionEnd", reason: "exit" }),
  );
  expect(reported.stdout).toContain("Reported 1 run(s)");

  const feedback = (await (await request.get(`${URL}/api/feedback?kit=debug-kit`)).json()) as { text: string; quote: string }[];
  expect(feedback.length).toBeGreaterThanOrEqual(1);
  expect(feedback.some((f) => /test/i.test(f.text))).toBe(true);
  for (const f of feedback) expect(f.quote.length).toBeLessThan(300);
});

test("SMOKE-2 @smoke proposal", async ({ page, request }) => {
  test.setTimeout(150_000);
  const feedback = (await (await request.get(`${URL}/api/feedback?kit=debug-kit&status=new`)).json()) as { id: number }[];
  for (const f of feedback) await request.patch(`${URL}/api/feedback/${f.id}`, { data: { status: "accepted" } });

  await page.goto(`${URL}/kits/debug-kit`);
  await page.getByTestId("improve-button").click();
  await page.getByTestId("improve-submit").click();
  await expect(page).toHaveURL(/\/proposals\/\d+$/, { timeout: 90_000 });
  await expect(page.getByTestId("proposal-hunk").first()).toBeVisible();
  expect(await page.locator('[data-testid="proposal-hunk"][data-file="SKILL.md"]').count()).toBeGreaterThanOrEqual(1);
});

test("SMOKE-3 @smoke publish", async ({ page, request }) => {
  test.setTimeout(60_000);
  const proposals = (await (await request.get(`${URL}/api/proposals?kit=debug-kit&status=draft`)).json()) as { id: number }[];
  await page.goto(`${URL}/kits/debug-kit/proposals/${proposals[0].id}`);
  const accepts = page.getByTestId("hunk-accept");
  for (let i = 0; i < (await accepts.count()); i++) await accepts.nth(i).click();
  await page.getByTestId("publish-button").click();
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.1.0");

  const files = async (v: string) =>
    ((await (await request.get(`${URL}/api/kits/debug-kit/files?version=${v}`)).json()) as { files: { path: string; content: string }[] }).files.find(
      (f) => f.path === "SKILL.md",
    )?.content;
  expect(await files("1.1.0")).not.toBe(await files("1.0.0"));
});

test("SMOKE-4 @smoke real transcript format", async ({ request }) => {
  test.setTimeout(180_000);
  const transcript = process.env.KITFORGE_SMOKE_TRANSCRIPT;
  test.skip(!transcript, "Set KITFORGE_SMOKE_TRANSCRIPT to a real Claude Code transcript that used an installed kit");

  // Import each kit the transcript read from the real ~/.claude/skills into the smoke server,
  // then install it into a temp home so detection runs exactly as it would after `kit pull`.
  const realHome = os.homedir();
  const smokeHome = tmpHome();
  const names = detectKits(parseTranscript(fs.readFileSync(transcript!, "utf8")));
  expect(names.length, "transcript shows no Read of ~/.claude/skills/<name>/SKILL.md").toBeGreaterThan(0);
  for (const name of names) {
    const dir = path.join(realHome, ".claude", "skills", name);
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) continue;
    const res = await request.post(`${URL}/api/kits/import`, { multipart: { path: dir } });
    expect([201, 409]).toContain(res.status());
    const body = (await res.json()) as { name?: string };
    const kitName = body.name ?? name;
    expect((await runKit(["pull", kitName], { home: smokeHome, env: { KITFORGE_URL: URL } })).code).toBe(0);
  }

  const result = await runKit(["report", "--transcript", transcript!, "--session-id", "smoke-real"], {
    home: smokeHome,
    env: { KITFORGE_URL: URL, KITFORGE_REPORT_TIMEOUT_MS: "60000" },
  });
  expect(result.stdout).toMatch(/Reported [1-9]\d* run\(s\)/);
});
