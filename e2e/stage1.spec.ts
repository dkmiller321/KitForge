import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  getJson,
  importDebugKit,
  importZip,
  kitCard,
  resetDb,
  versionRow,
  type KitDto,
} from "./helpers/flows";
import { FIXTURES } from "./helpers/zip";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("E2E-01 @stage1 import a zip (K1, K2, U1)", async ({ page, request }) => {
  await importDebugKit(page);
  await expect(page.getByTestId("kit-card")).toHaveCount(1);
  const card = kitCard(page, "debug-kit");
  await expect(card.getByTestId("kit-card-version")).toHaveText("v1.0.0");
  await expect(card.getByTestId("kit-card-runs")).toHaveText("0 runs");
  await expect(card.getByTestId("kit-card-success")).toHaveText("—");

  const kit = await getJson<KitDto>(request, "/api/kits/debug-kit");
  expect(kit.versions).toHaveLength(1);
  expect(kit.versions[0]).toMatchObject({ semver: "1.0.0", isCurrent: true, changelogMd: "- Imported" });
});

test("E2E-02 @stage1 import from folder path and nested zip (K1)", async ({ page, request }) => {
  await page.goto("/");
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-path").fill(path.join(FIXTURES, "feature-kit"));
  await page.getByTestId("import-submit").click();
  await expect(kitCard(page, "new-feature-kit")).toBeVisible();
  await expect(kitCard(page, "new-feature-kit").getByTestId("kit-card-version")).toHaveText("v1.0.0");

  await importZip(page, "debug-kit-nested.zip");
  await expect(kitCard(page, "debug-kit")).toBeVisible();
  const files = await getJson<{ files: { path: string }[] }>(request, "/api/kits/debug-kit/files");
  expect(files.files.map((f) => f.path).sort()).toEqual(["SKILL.md", "references/checklist.md"]);

  const order = await page.getByTestId("kit-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-kit-name")));
  expect(order).toEqual(["debug-kit", "new-feature-kit"]);
});

test("E2E-03 @stage1 invalid and duplicate imports are rejected (K1, Reliability)", async ({ page, request }) => {
  await importZip(page, "invalid-kit.zip");
  await expect(page.getByTestId("import-error")).toHaveText("No SKILL.md found");
  await expect(page.getByTestId("kit-card")).toHaveCount(0);
  expect(await getJson<unknown[]>(request, "/api/kits")).toEqual([]);

  await importDebugKit(page);
  await importZip(page, "debug-kit.zip");
  await expect(page.getByTestId("import-error")).toHaveText("A kit named debug-kit already exists.");
  const kit = await getJson<KitDto>(request, "/api/kits/debug-kit");
  expect(kit.versions).toHaveLength(1);
});

test("E2E-04 @stage1 kit viewer (K3, U2)", async ({ page }) => {
  await importDebugKit(page);
  await kitCard(page, "debug-kit").click();
  await expect(page).toHaveURL(/\/kits\/debug-kit$/);
  await expect(page.getByTestId("kit-title")).toHaveText("debug-kit");
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.0.0");
  await expect(page.getByTestId("pull-command")).toHaveText("kit pull debug-kit@1.0.0");

  const items = page.getByTestId("file-tree-item");
  await expect(items).toHaveCount(2);
  expect((await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-path")))).sort()).toEqual([
    "SKILL.md",
    "references/checklist.md",
  ]);

  const viewer = page.getByTestId("file-viewer");
  await expect(viewer.getByRole("heading", { name: "Debug Kit" })).toBeVisible();
  await expect(viewer).toContainText("Fix the root cause, not the symptom.");

  await page.locator('[data-testid="file-tree-item"][data-path="references/checklist.md"]').click();
  await expect(viewer).toContainText("Failing test written");
});

test("E2E-05 @stage1 persistence and immutability (K4, K5)", async ({ page, request }) => {
  await importDebugKit(page);
  await kitCard(page, "debug-kit").click();
  await expect(page.getByTestId("file-viewer")).toContainText("Fix the root cause, not the symptom.");
  await page.reload();
  await expect(page.getByTestId("file-viewer")).toContainText("Fix the root cause, not the symptom.");

  await page.getByTestId("tab-versions").click();
  await expect(page.getByTestId("version-row")).toHaveCount(1);
  const row = versionRow(page, "1.0.0");
  await expect(row).toHaveAttribute("data-current", "true");
  await expect(row.getByTestId("changelog-entry")).toHaveCount(1);
  await expect(row.getByTestId("changelog-entry")).toHaveText("Imported");

  const url = "/api/kits/debug-kit/versions/1.0.0";
  expect((await request.put(url, { data: {} })).status()).toBe(405);
  expect((await request.patch(url, { data: {} })).status()).toBe(405);
  expect((await request.delete(url)).status()).toBe(405);
});
