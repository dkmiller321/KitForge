import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { tmpHome } from "./helpers/cli";
import {
  X3_TEXT,
  feedbackList,
  getJson,
  hunkForFile,
  importDebugKit,
  importFeatureKitFolder,
  inboxItem,
  pull,
  report,
  reportPartial,
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

test("E2E-23 @stage6 edit a hunk before accepting (I5)", async ({ page, request }) => {
  await setupProposal(page, request, home);
  const skill = hunkForFile(page, "SKILL.md");
  await skill.getByTestId("hunk-edit").click();
  await skill.getByTestId("hunk-edit-input").fill("1. Always write a failing test first.");
  await skill.getByTestId("hunk-edit-save").click();
  await expect(skill.getByTestId("hunk-added")).toContainText("1. Always write a failing test first.");
  await skill.getByTestId("hunk-accept").click();
  await hunkForFile(page, "references/checklist.md").getByTestId("hunk-accept").click();
  await page.getByTestId("publish-button").click();
  await expect(page).toHaveURL(/\/kits\/debug-kit$/);

  const files = await getJson<{ files: { path: string; content: string }[] }>(request, "/api/kits/debug-kit/files?version=1.1.0");
  const skillMd = files.files.find((f) => f.path === "SKILL.md")!.content;
  expect(skillMd).toContain("1. Always write a failing test first.");
  expect(skillMd).not.toContain("Never write the fix first.");
});

test("E2E-24 @stage6 regenerate with instruction (I6)", async ({ page, request }) => {
  await setupProposal(page, request, home);
  const oldId = Number(/proposals\/(\d+)$/.exec(page.url())![1]);

  await page.getByTestId("regenerate-instruction").fill("shorter");
  await page.getByTestId("regenerate-button").click();
  await expect(page).not.toHaveURL(new RegExp(`/proposals/${oldId}$`));
  await expect(page).toHaveURL(/\/kits\/debug-kit\/proposals\/\d+$/);
  await expect(page.getByTestId("proposal-hunk")).toHaveCount(1);
  await expect(page.getByTestId("hunk-added")).toContainText("3. Fix the root cause.");
  const old = await getJson<{ status: string }>(request, `/api/proposals/${oldId}`);
  expect(old.status).toBe("discarded");
});

test("E2E-25 @stage6 diff two versions (K6)", async ({ page, request }) => {
  await setupPublished(page, request, home);
  await page.getByTestId("tab-versions").click();
  await page.getByTestId("diff-from").selectOption("1.0.0");
  await page.getByTestId("diff-to").selectOption("1.1.0");
  await page.getByTestId("diff-show").click();
  const diff = page.getByTestId("version-diff");
  await expect(diff).toContainText("SKILL.md");
  await expect(diff).toContainText("references/checklist.md");
  await expect(diff).toContainText("1. Reproduce the bug with a failing test before changing code.");
  await expect(diff).toContainText("- [ ] Only the failing test run while iterating");
});

test("E2E-26 @stage6 rollback (K7, U11)", async ({ page, request }) => {
  await setupPublished(page, request, home);
  await page.getByTestId("tab-versions").click();
  await versionRow(page, "1.0.0").getByTestId("set-current-button").click();
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.0.0");
  await expect(page.getByTestId("pull-command")).toHaveText("kit pull debug-kit@1.0.0");

  const pulled = await pull(home);
  expect(pulled.stdout).toMatch(/^Installed debug-kit@1\.0\.0 to /);
  const skillMd = fs.readFileSync(path.join(home, ".claude", "skills", "debug-kit", "SKILL.md"), "utf8");
  expect(skillMd).not.toContain("Never write the fix first.");
  const kit = await getJson<KitDto>(request, "/api/kits/debug-kit");
  expect(kit.versions.map((v) => v.semver)).toContain("1.1.0");
});

test("E2E-27 @stage6 manual edit, and stale proposals are refused (K8, I3 rule)", async ({ page, request }) => {
  await setupProposal(page, request, home);
  const proposalUrl = page.url();

  await page.goto("/kits/debug-kit");
  await page.getByTestId("edit-kit-button").click();
  await page.getByTestId("edit-file-select").selectOption("SKILL.md");
  const textarea = page.getByTestId("edit-textarea");
  const current = await textarea.inputValue();
  await textarea.fill(`${current.replace(/\n*$/, "\n")}4. Commit the test with the fix.\n`);
  await page.getByTestId("edit-changelog").fill("Manual tweak");
  await page.getByTestId("edit-save").click();
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.0.1");
  const kit = await getJson<KitDto>(request, "/api/kits/debug-kit");
  expect(kit.currentVersion).toBe("1.0.1");
  expect(kit.versions.find((v) => v.semver === "1.0.1")?.changelogMd).toBe("- Manual tweak");

  await page.goto(proposalUrl);
  await hunkForFile(page, "SKILL.md").getByTestId("hunk-accept").click();
  await hunkForFile(page, "references/checklist.md").getByTestId("hunk-accept").click();
  await page.getByTestId("publish-button").click();
  await expect(page.getByTestId("publish-error")).toHaveText(
    "This proposal was made for 1.0.0, but the current version is 1.0.1. Regenerate it.",
  );
  const after = await getJson<KitDto>(request, "/api/kits/debug-kit");
  const versions = after.versions.map((v) => v.semver);
  expect(versions).not.toContain("1.1.0");
  expect(versions).not.toContain("1.0.2");
});

test("E2E-28 @stage6 merge duplicates (T3)", async ({ page, request }) => {
  await importDebugKit(page);
  await pull(home);
  expect((await reportPartial(home)).stdout.trim()).toBe("Reported 1 run(s)");
  expect((await report(home, "transcript-debug-dup.jsonl", "sess-003")).stdout.trim()).toBe("Reported 1 run(s)");
  const [f1] = await x1Ids(request);
  const x3 = (await feedbackList(request)).find((f) => f.text === X3_TEXT)!;

  await page.getByTestId("nav-inbox").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(3);
  await inboxItem(page, f1).getByTestId("inbox-select").check();
  await inboxItem(page, x3.id).getByTestId("inbox-select").check();
  await page.getByTestId("merge-button").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(2);
  await expect(inboxItem(page, f1).getByTestId("feedback-runs")).toHaveText("2 runs");

  const merged = (await feedbackList(request)).find((f) => f.id === x3.id)!;
  expect(merged.status).toBe("merged");
  expect(merged.mergedIntoId).toBe(f1);
});

test("E2E-29 @stage6 compare versions (M2)", async ({ page, request }) => {
  await setupPublished(page, request, home);
  await pull(home);
  expect((await report(home, "transcript-debug-success.jsonl", "sess-002")).stdout.trim()).toBe("Reported 1 run(s)");

  await page.goto("/kits/debug-kit");
  await page.getByTestId("tab-metrics").click();
  await page.getByTestId("compare-link").click();
  const a = page.getByTestId("compare-a");
  const b = page.getByTestId("compare-b");
  for (const text of ["1.0.0", "0%", "2.0"]) await expect(a).toContainText(text);
  for (const text of ["1.1.0", "100%", "0.0"]) await expect(b).toContainText(text);
});

test("E2E-30 @stage6 test counts (R6)", async ({ page, request }) => {
  await setupReported(page, home);
  await page.goto("/kits/debug-kit");
  await page.getByTestId("tab-runs").click();
  await expect(page.getByTestId("run-tests")).toHaveText("3 passed, 1 failed");

  await importFeatureKitFolder(page);
  await pull(home, "new-feature-kit");
  expect((await report(home, "transcript-feature.jsonl", "sess-004")).stdout.trim()).toBe("Reported 1 run(s)");
  const run = (await getJson<RunDto[]>(request, "/api/runs?kit=new-feature-kit"))[0];
  await page.goto("/kits/new-feature-kit");
  await page.getByTestId("tab-runs").click();
  await expect(page.locator(`[data-testid="run-row"][data-run-id="${run.id}"]`).getByTestId("run-tests")).toHaveText("—");
});

