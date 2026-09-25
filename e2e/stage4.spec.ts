import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import {
  X1,
  importDebugKit,
  importFeatureKitFolder,
  inboxItem,
  kitCard,
  pull,
  report,
  reportPartial,
  resetDb,
  setupReported,
  x1Ids,
} from "./helpers/flows";

let home: string;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  home = tmpHome();
});

test("E2E-14 @stage4 triage (T1, T2, U6)", async ({ page, request }) => {
  await setupReported(page, home);
  const [f1, f2] = await x1Ids(request);

  await page.goto("/");
  await expect(page.getByTestId("inbox-count")).toHaveText("2");
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("inbox-tab-new").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(2);
  await expect(inboxItem(page, f1).getByTestId("feedback-kit")).toHaveText("debug-kit");
  await expect(inboxItem(page, f1).getByTestId("feedback-quote")).toContainText(X1[0].quote);
  await expect(inboxItem(page, f2).getByTestId("feedback-kit")).toHaveText("debug-kit");
  await expect(inboxItem(page, f2).getByTestId("feedback-quote")).toContainText(X1[1].quote);

  await inboxItem(page, f1).getByTestId("feedback-accept").click();
  await expect(inboxItem(page, f1)).toHaveCount(0);
  await inboxItem(page, f2).getByTestId("feedback-dismiss").click();
  await expect(page.getByTestId("inbox-empty")).toHaveText("Nothing to triage");
  await expect(page.getByTestId("inbox-count")).toBeHidden();

  await page.getByTestId("inbox-tab-accepted").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(1);
  await expect(inboxItem(page, f1)).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("inbox-count")).toBeHidden();
  await page.getByTestId("inbox-tab-accepted").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(1);
  await expect(inboxItem(page, f1)).toBeVisible();
  await page.getByTestId("inbox-tab-new").click();
  await expect(page.getByTestId("inbox-empty")).toHaveText("Nothing to triage");

  await page.goto("/kits/debug-kit");
  await expect(page.getByTestId("improve-count")).toHaveText("1 accepted");
});

test("E2E-15 @stage4 filter and tags (T1, T2)", async ({ page, request }) => {
  await importDebugKit(page);
  await importFeatureKitFolder(page);
  await pull(home, "debug-kit");
  await pull(home, "new-feature-kit");
  expect((await reportPartial(home)).stdout.trim()).toBe("Reported 1 run(s)");
  expect((await report(home, "transcript-feature.jsonl", "sess-004")).stdout.trim()).toBe("Reported 1 run(s)");
  const [f1] = await x1Ids(request);

  await page.getByTestId("nav-inbox").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(3);
  await page.getByTestId("inbox-filter-kit").selectOption("new-feature-kit");
  await expect(page.getByTestId("inbox-item")).toHaveCount(1);
  await expect(page.getByTestId("inbox-item").getByTestId("feedback-text")).toHaveText(
    "Edited the module without reading it first",
  );

  await page.getByTestId("inbox-filter-kit").selectOption("all");
  await expect(page.getByTestId("inbox-item")).toHaveCount(3);
  await inboxItem(page, f1).getByTestId("feedback-tag-input").fill("testing");
  await inboxItem(page, f1).getByTestId("feedback-tag-input").press("Enter");
  await expect(inboxItem(page, f1).getByTestId("feedback-tag")).toHaveText(["testing"]);
  await page.reload();
  await expect(inboxItem(page, f1).getByTestId("feedback-tag")).toHaveText(["testing"]);
});

test("E2E-16 @stage4 manual note and outcome override (L5, R5, U5)", async ({ page, request }) => {
  await setupReported(page, home);

  const noted = await runKit(["note", "Good root-cause analysis", "--rating", "4"], { home });
  expect(noted.code).toBe(0);
  expect(noted.stdout).toMatch(/^Added note to run #\d+$/m);

  await page.getByTestId("nav-inbox").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(3);
  const noteItem = page.getByTestId("inbox-item").filter({ hasText: "Good root-cause analysis" });
  await expect(noteItem.getByTestId("feedback-text")).toHaveText("Good root-cause analysis");
  await expect(noteItem.getByTestId("feedback-rating")).toHaveText("4/5");

  await page.goto("/kits/debug-kit");
  await page.getByTestId("tab-runs").click();
  await page.getByTestId("run-outcome-select").selectOption("success");
  await expect(page.getByTestId("run-outcome")).toHaveText("success");
  await page.reload();
  await page.getByTestId("tab-runs").click();
  await expect(page.getByTestId("run-outcome")).toHaveText("success");
  await page.goto("/");
  await expect(kitCard(page, "debug-kit").getByTestId("kit-card-success")).toHaveText("100%");

  await resetDb(request);
  const empty = await runKit(["note", "x"], { home: tmpHome() });
  expect(empty.code).toBe(1);
  expect(empty.stderr.trim()).toBe("No runs yet");
});

test("E2E-17 @stage4 keyboard triage (Accessibility)", async ({ page }) => {
  await setupReported(page, home);
  await page.getByTestId("nav-inbox").click();
  await expect(page.getByTestId("inbox-item")).toHaveCount(2);

  await page.keyboard.press("j");
  const first = page.getByTestId("inbox-item").first();
  await expect(first).toHaveAttribute("data-focused", "true");
  const firstId = Number(await first.getAttribute("data-feedback-id"));

  await page.keyboard.press("a");
  await expect(inboxItem(page, firstId)).toHaveCount(0);
  await expect(page.getByTestId("inbox-item")).toHaveCount(1);

  await page.keyboard.press("j");
  await page.keyboard.press("d");
  await expect(page.getByTestId("inbox-empty")).toHaveText("Nothing to triage");

  await page.getByTestId("inbox-tab-accepted").click();
  await expect(inboxItem(page, firstId)).toBeVisible();
  await expect(page.getByTestId("inbox-item")).toHaveCount(1);
});
