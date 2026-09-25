import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import {
  analyze,
  analyzeViaApi,
  feedbackList,
  fixtureFile,
  getJson,
  hunkForFile,
  improve,
  inboxItem,
  metricsRow,
  pull,
  report,
  resetDb,
  setupProposal,
  setupPublished,
  setupReported,
  versionRow,
  x1Ids,
  type KitDto,
  type RunDto,
} from "./helpers/flows";

let home: string;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  home = tmpHome();
});

test("E2E-18 @stage5 proposal from the kit's insights (A1, I1, I2, U7)", async ({ page, request }) => {
  await setupReported(page, home);
  const [f1, f2] = await x1Ids(request);

  await page.goto("/kits/debug-kit");
  await expect(page.getByTestId("improve-count")).toHaveText("0 themes");
  await expect(page.getByTestId("improve-button")).toBeDisabled();
  await analyze(page);
  await expect(page.getByTestId("improve-count")).toHaveText("2 themes");
  await page.getByTestId("improve-button").click();
  await page.getByTestId("improve-submit").click();
  await expect(page.getByTestId("proposal-loading")).toBeVisible();
  await expect(page).toHaveURL(/\/kits\/debug-kit\/proposals\/\d+$/);

  await expect(page.getByTestId("proposal-hunk")).toHaveCount(2);
  const skill = hunkForFile(page, "SKILL.md");
  const checklist = hunkForFile(page, "references/checklist.md");
  await expect(skill).toHaveCount(1);
  await expect(checklist).toHaveCount(1);
  await expect(skill.getByTestId("hunk-removed")).toContainText("1. Reproduce the bug with a failing test before changing code.");
  await expect(skill.getByTestId("hunk-added")).toContainText("Never write the fix first.");
  for (const hunk of [skill, checklist]) await expect(hunk.getByTestId("hunk-rationale")).not.toBeEmpty();
  await expect(skill.getByTestId("hunk-feedback-link")).toHaveAttribute("data-feedback-id", String(f1));
  await expect(checklist.getByTestId("hunk-feedback-link")).toHaveAttribute("data-feedback-id", String(f2));

  const publish = page.getByTestId("publish-button");
  await expect(publish).toBeDisabled();
  await skill.getByTestId("hunk-accept").click();
  await expect(skill).toHaveAttribute("data-decision", "accepted");
  await expect(publish).toBeDisabled();
  await checklist.getByTestId("hunk-accept").click();
  await expect(publish).toBeEnabled();
});

test("E2E-19 @stage5 ★ THE CORE LOOP: feedback becomes a better installed kit", async ({ page, request }) => {
  // 1–2. Import, pull, report partial; Analyze; Improve; accept both hunks; publish (minor).
  const [f1, f2] = await setupPublished(page, request, home);

  // 3. Redirected to the kit, now at 1.1.0 with the new rule.
  await expect(page).toHaveURL(/\/kits\/debug-kit$/);
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.1.0");
  await expect(page.getByTestId("file-viewer")).toContainText("Never write the fix first.");

  // 4. Version timeline with a changelog linked to both feedback items.
  await page.getByTestId("tab-versions").click();
  await expect(page.getByTestId("version-row")).toHaveCount(2);
  const v110 = versionRow(page, "1.1.0");
  await expect(v110).toHaveAttribute("data-current", "true");
  await expect(v110.getByTestId("changelog-entry")).toHaveCount(2);
  const linked = await v110
    .getByTestId("changelog-feedback-link")
    .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-feedback-id"))));
  expect(linked.sort((a, b) => a - b)).toEqual([f1, f2].sort((a, b) => a - b));

  // 5. Both items resolved in 1.1.0.
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("inbox-tab-resolved").click();
  for (const id of [f1, f2]) {
    await expect(inboxItem(page, id).getByTestId("feedback-status")).toHaveText("Resolved in 1.1.0");
  }

  // 6. 1.0.0 is unchanged.
  const v100 = await getJson<{ files: { path: string; content: string }[] }>(request, "/api/kits/debug-kit/files?version=1.0.0");
  expect(v100.files.find((f) => f.path === "SKILL.md")?.content).toBe(fixtureFile("debug-kit", "SKILL.md"));
  expect(v100.files.find((f) => f.path === "references/checklist.md")?.content).toBe(
    fixtureFile("debug-kit", "references", "checklist.md"),
  );
  expect(v100.files).toHaveLength(2);

  // 7. Pull installs 1.1.0.
  const pulled = await pull(home);
  expect(pulled.stdout).toMatch(/^Installed debug-kit@1\.1\.0 to /);
  const dir = path.join(home, ".claude", "skills", "debug-kit");
  expect(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")).toContain("Never write the fix first.");
  expect(JSON.parse(fs.readFileSync(path.join(dir, ".kitforge.json"), "utf8")).version).toBe("1.1.0");
  const listed = await runKit(["list"], { home });
  expect(listed.stdout.split("\n")).toContain("debug-kit 1.1.0 (latest 1.1.0)");

  // 8. A new session on 1.1.0 is recorded against 1.1.0.
  const success = await report(home, "transcript-debug-success.jsonl", "sess-002");
  expect(success.stdout.trim()).toBe("Reported 1 run(s)");
  const runs = await getJson<RunDto[]>(request, "/api/runs?kit=debug-kit");
  const run2 = runs.find((r) => r.sessionId === "sess-002")!;
  await page.goto("/kits/debug-kit");
  await page.getByTestId("tab-runs").click();
  const row = page.locator(`[data-testid="run-row"][data-run-id="${run2.id}"]`);
  await expect(row.getByTestId("run-version")).toHaveText("1.1.0");
  await expect(row.getByTestId("run-outcome")).toHaveText("success");

  // 9. Metrics show the improvement.
  await page.getByTestId("tab-metrics").click();
  const m100 = metricsRow(page, "1.0.0");
  await expect(m100.getByTestId("metric-runs")).toHaveText("1");
  await expect(m100.getByTestId("metric-success")).toHaveText("0%");
  await expect(m100.getByTestId("metric-corrections")).toHaveText("2.0");
  const m110 = metricsRow(page, "1.1.0");
  await expect(m110.getByTestId("metric-runs")).toHaveText("1");
  await expect(m110.getByTestId("metric-success")).toHaveText("100%");
  await expect(m110.getByTestId("metric-corrections")).toHaveText("0.0");
});

test("E2E-20 @stage5 partial accept and patch bump (I2, I3, I4)", async ({ page, request }) => {
  const [f1, f2] = await setupProposal(page, request, home);
  await hunkForFile(page, "SKILL.md").getByTestId("hunk-accept").click();
  await hunkForFile(page, "references/checklist.md").getByTestId("hunk-reject").click();
  await page.getByTestId("bump-select").selectOption("patch");
  await page.getByTestId("publish-button").click();

  await expect(page).toHaveURL(/\/kits\/debug-kit$/);
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.0.1");
  const v101 = await getJson<{ files: { path: string; content: string }[] }>(request, "/api/kits/debug-kit/files?version=1.0.1");
  expect(v101.files.find((f) => f.path === "references/checklist.md")?.content).toBe(
    fixtureFile("debug-kit", "references", "checklist.md"),
  );

  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("inbox-tab-resolved").click();
  await expect(inboxItem(page, f1).getByTestId("feedback-status")).toHaveText("Resolved in 1.0.1");
  // F2's change was rejected, so F2 stays open; the insights now predate 1.0.1.
  await page.getByTestId("inbox-tab-new").click();
  await expect(inboxItem(page, f2)).toBeVisible();
  await expect(inboxItem(page, f2).getByTestId("feedback-status")).toHaveText("new");
  await page.goto("/kits/debug-kit?tab=insights");
  await expect(page.getByTestId("insights-stale")).toContainText("newer version");
});

test("E2E-21 @stage5 unusable edits are dropped (I1 rule)", async ({ page, request }) => {
  await setupReported(page, home);
  await analyzeViaApi(request);
  await improve(page, "MOCK:bad-hunk");
  await expect(page).toHaveURL(/\/kits\/debug-kit\/proposals\/\d+$/);
  await expect(page.getByTestId("proposal-hunk")).toHaveCount(1);
  await expect(page.getByTestId("proposal-dropped")).toHaveText("1 suggested change couldn't be applied and was dropped");
});

test("E2E-22 @stage5 proposal failure is atomic (I1, Reliability)", async ({ page, request }) => {
  await setupReported(page, home);
  const ids = await x1Ids(request);
  await analyzeViaApi(request);
  await improve(page, "MOCK:proposal-fail");
  await expect(page.getByTestId("proposal-error")).toHaveText("Couldn't generate a proposal. Nothing was changed.");
  await expect(page).toHaveURL(/\/kits\/debug-kit$/);
  expect(await getJson<unknown[]>(request, "/api/proposals?kit=debug-kit&status=draft")).toEqual([]);
  expect((await getJson<KitDto>(request, "/api/kits/debug-kit")).currentVersion).toBe("1.0.0");
  const items = await feedbackList(request, "?kit=debug-kit");
  for (const id of ids) expect(items.find((f) => f.id === id)?.status).toBe("new");
});
