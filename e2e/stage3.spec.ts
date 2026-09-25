import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import {
  X1,
  feedbackList,
  getJson,
  importDebugKit,
  kitCard,
  outboxFiles,
  pull,
  report,
  reportPartial,
  resetDb,
  setupReported,
  type RunDto,
} from "./helpers/flows";
import { buildTranscript } from "./helpers/transcript";

let home: string;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  home = tmpHome();
});

test("E2E-09 @stage3 hook install is idempotent and non-destructive (L3)", async () => {
  const settings = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, JSON.stringify({ theme: "dark" }));

  for (let i = 0; i < 2; i++) {
    const result = await runKit(["hook", "install"], { home });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(`SessionEnd hook installed in ${settings}`);
  }
  const parsed = JSON.parse(fs.readFileSync(settings, "utf8"));
  expect(parsed.theme).toBe("dark");
  expect(parsed.hooks.SessionEnd).toHaveLength(1);
  expect(parsed.hooks.SessionEnd[0].hooks).toEqual([{ type: "command", command: "kit report" }]);
});

test("E2E-10 @stage3 report via hook stdin (L4, R1, R2, R3, R4, U4)", async ({ page, request }) => {
  await importDebugKit(page);
  await pull(home);
  const result = await reportPartial(home);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe("Reported 1 run(s)");

  await page.goto("/kits/debug-kit");
  await page.getByTestId("tab-runs").click();
  await expect(page.getByTestId("run-row")).toHaveCount(1);
  await expect(page.getByTestId("run-outcome")).toHaveText("partial");
  await expect(page.getByTestId("run-corrections")).toHaveText("2");
  await expect(page.getByTestId("run-version")).toHaveText("1.0.0");

  const runsRes = await request.get("/api/runs?kit=debug-kit");
  const runs = (await runsRes.json()) as Record<string, unknown>[];
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ sessionId: "sess-001", projectPath: "/tmp/proj-a" });
  expect(Object.keys(runs[0]).filter((k) => k.toLowerCase().includes("transcript"))).toEqual([]);

  const items = await feedbackList(request, "?kit=debug-kit&status=new");
  expect(items).toHaveLength(2);
  expect(items.map((f) => ({ text: f.text, quote: f.quote })).sort((a, b) => a.text.localeCompare(b.text))).toEqual(
    X1.map((x) => ({ text: x.text, quote: x.quote })).sort((a, b) => a.text.localeCompare(b.text)),
  );
  for (const item of items) expect(item.kind).toBe("correction");

  await page.goto("/");
  await expect(kitCard(page, "debug-kit").getByTestId("kit-card-runs")).toHaveText("1 run");
  await expect(kitCard(page, "debug-kit").getByTestId("kit-card-success")).toHaveText("0%");
});

test("E2E-11 @stage3 idempotent, and sessions without a kit are ignored (L4)", async ({ page, request }) => {
  await setupReported(page, home);

  const again = await reportPartial(home);
  expect(again.code).toBe(0);
  expect(again.stdout.trim()).toBe("Reported 0 run(s)");
  expect(await getJson<RunDto[]>(request, "/api/runs")).toHaveLength(1);
  expect(await feedbackList(request)).toHaveLength(2);

  const noKit = await report(home, "transcript-no-kit.jsonl", "sess-002");
  expect(noKit.code).toBe(0);
  expect(noKit.stdout.trim()).toBe("No kits used");
  expect(await getJson<RunDto[]>(request, "/api/runs")).toHaveLength(1);
});

test("E2E-12 @stage3 app down: queue, never fail (Reliability)", async ({ page, request }) => {
  await importDebugKit(page);
  await pull(home);

  const down = await reportPartial(home, { KITFORGE_URL: "http://127.0.0.1:59999" });
  expect(down.code).toBe(0);
  expect(down.stdout.trim()).toBe("Queued 1 report(s)");
  expect(down.ms).toBeLessThan(12_000);
  expect(outboxFiles(home)).toHaveLength(1);

  const flush = await report(home, "transcript-no-kit.jsonl", "sess-009");
  expect(flush.code).toBe(0);
  expect(flush.stdout).toContain("Flushed 1 queued report(s)");
  expect(outboxFiles(home)).toHaveLength(0);
  const runs = await getJson<RunDto[]>(request, "/api/runs?kit=debug-kit");
  expect(runs.map((r) => r.sessionId)).toContain("sess-001");
});

test("E2E-13 @stage3 extraction failure is atomic (R3, Reliability)", async ({ page, request }) => {
  await importDebugKit(page);
  await pull(home);
  const result = await report(home, buildTranscript({ marker: "MOCK:extract-fail", skill: "debug-kit" }), "sess-010");
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe("Queued 1 report(s)");
  expect(await getJson<RunDto[]>(request, "/api/runs")).toEqual([]);
  expect(await feedbackList(request)).toEqual([]);
});
