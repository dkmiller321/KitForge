import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import { feedbackList, fixtureFile, getJson, importDebugKit, pull, resetDb, type KitDto, type RunDto } from "./helpers/flows";

let home: string;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  home = tmpHome();
});

const REPORT = {
  session_id: "claude-001",
  kit: "debug-kit",
  version: "1.0.0",
  project_path: "/tmp/proj-b",
  outcome: "partial",
  corrections: [
    { text: "Changed code before writing a failing test", quote: "Write the test first." },
    { text: "Ran the whole suite on every change", quote: `Just the one test, please. ${"x".repeat(400)}` },
  ],
  tests: { passed: 5, failed: 1 },
};

test("E2E-31 @stage7 self-report from the kit's final step (L7, R1, R2)", async ({ page, request }) => {
  await importDebugKit(page);

  const first = await request.post("/api/runs/report", { data: REPORT });
  expect(first.status()).toBe(201);
  const body = await first.json();
  expect(body).toMatchObject({ created: true, message: `Reported to KitForge: run #${body.runId}, 2 correction(s)` });

  const again = await request.post("/api/runs/report", { data: REPORT });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ created: false, runId: body.runId });

  expect((await request.post("/api/runs/report", { data: { ...REPORT, kit: "nope" } })).status()).toBe(404);
  expect((await request.post("/api/runs/report", { data: { ...REPORT, version: "9.9.9" } })).status()).toBe(404);
  expect((await request.post("/api/runs/report", { data: { ...REPORT, outcome: "great" } })).status()).toBe(400);

  const runs = await getJson<RunDto[]>(request, "/api/runs?kit=debug-kit");
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ sessionId: "claude-001", projectPath: "/tmp/proj-b", outcome: "partial", correctionCount: 2 });
  const items = await feedbackList(request, "?kit=debug-kit&status=new");
  expect(items.map((f) => f.text).sort()).toEqual(REPORT.corrections.map((c) => c.text).sort());
  for (const f of items) expect(f.quote!.length).toBeLessThan(300);

  await page.goto("/kits/debug-kit");
  await page.getByTestId("tab-runs").click();
  await expect(page.getByTestId("run-outcome")).toHaveText("partial");
  await expect(page.getByTestId("run-corrections")).toHaveText("2");
  await expect(page.getByTestId("run-tests")).toHaveText("5 passed, 1 failed");
  await page.getByTestId("nav-inbox").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(2);

  // Builder-observed issues have no user quote: the quote is optional.
  const noQuote = await request.post("/api/runs/report", {
    data: { ...REPORT, session_id: "claude-002", corrections: [{ text: "[env] Port 5432 was already taken" }] },
  });
  expect(noQuote.status()).toBe(201);
  const stored = (await feedbackList(request, "?kit=debug-kit")).find((f) => f.text === "[env] Port 5432 was already taken");
  expect(stored?.quote).toBeNull();
});

test("E2E-32 @stage7 kits carry the reporting step, and it works as written (L1, L7)", async ({ page, request }) => {
  await importDebugKit(page);
  const kit = await getJson<KitDto>(request, "/api/kits/debug-kit");

  // Download for Claude: a zip whose SKILL.md ends with the reporting step.
  await page.goto("/kits/debug-kit");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-button").click()]);
  expect(download.suggestedFilename()).toBe("debug-kit-1.0.0.zip");
  const zipPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kitforge-export-")), "kit.zip");
  await download.saveAs(zipPath);
  const zip = new AdmZip(zipPath);
  expect(zip.getEntries().map((e) => e.entryName).sort()).toEqual(["debug-kit/SKILL.md", "debug-kit/references/checklist.md"]);
  const exported = zip.readAsText("debug-kit/SKILL.md");
  expect(exported.startsWith(fixtureFile("debug-kit", "SKILL.md").trimEnd())).toBe(true);
  expect(exported).toContain("## Final step: report this session to KitForge");
  expect(exported).toContain('"version": "1.0.0"');
  expect(zip.readAsText("debug-kit/references/checklist.md")).toBe(fixtureFile("debug-kit", "references", "checklist.md"));
  expect((await getJson<KitDto>(request, "/api/kits/debug-kit")).versions).toHaveLength(1);

  // kit pull --report installs the same step; the manifest still carries the stored version's hash.
  const installed = await runKit(["pull", "debug-kit", "--report"], { home });
  expect(installed.code, installed.stderr).toBe(0);
  const dir = path.join(home, ".claude", "skills", "debug-kit");
  const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  expect(skill).toBe(exported);
  expect(JSON.parse(fs.readFileSync(path.join(dir, ".kitforge.json"), "utf8")).hash).toBe(kit.versions[0].contentHash);

  // Do exactly what the step tells Claude to do: fill in the JSON and POST it to the URL in the command.
  const url = /curl -s -X POST (\S+)/.exec(skill)![1];
  const template = /<<'JSON'\n([\s\S]*?)\nJSON/.exec(skill)![1];
  const filled = JSON.parse(
    template
      .replace("<absolute path of the project you worked in>", "/tmp/proj-c")
      .replace("<success | partial | failed>", "success")
      .replace("<what you did that the user corrected, in general terms>", "Guessed the config path")
      .replace("<the user's own words, under 300 characters>", "Check the config first."),
  );
  expect(new URL(url).pathname).toBe("/api/runs/report");
  const sent = await request.post("/api/runs/report", { data: filled });
  expect(sent.status()).toBe(201);
  const [run] = await getJson<RunDto[]>(request, "/api/runs?kit=debug-kit");
  expect(run).toMatchObject({ version: "1.0.0", outcome: "success", correctionCount: 1, projectPath: "/tmp/proj-c" });

  // A plain pull (no --report) still installs the stored files unchanged.
  await pull(home);
  expect(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")).toBe(fixtureFile("debug-kit", "SKILL.md"));
});
