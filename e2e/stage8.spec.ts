import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import { feedbackList, hunkForFile, importDebugKit, pull, report, reportPartial, resetDb, X3_TEXT } from "./helpers/flows";

let home: string;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  home = tmpHome();
});

const selfReport = (text: string) => ({
  kit: "debug-kit",
  version: "1.0.0",
  outcome: "partial",
  corrections: [{ text, quote: "From a self-report." }],
  tests: null,
});

test("E2E-33 @stage8 insights: all feedback from every run becomes ranked themes that drive Improve (A1, A2, A3, I1, I4)", async ({
  page,
  request,
}) => {
  await importDebugKit(page);
  await pull(home);
  expect((await reportPartial(home)).stdout.trim()).toBe("Reported 1 run(s)");
  expect((await report(home, "transcript-debug-dup.jsonl", "sess-003")).stdout.trim()).toBe("Reported 1 run(s)");
  expect((await runKit(["note", "Good root-cause analysis", "--rating", "4"], { home })).code).toBe(0);
  const all = await feedbackList(request, "?kit=debug-kit");
  expect(all).toHaveLength(4);
  const x3 = all.find((f) => f.text === X3_TEXT)!;

  // Analyze reads every open item; nothing had to be accepted first.
  await page.goto("/kits/debug-kit?tab=insights");
  await expect(page.getByTestId("improve-button")).toBeDisabled();
  await page.getByTestId("analyze-button").click();
  await expect(page.getByTestId("insights-loading")).toBeVisible();
  await expect(page.getByTestId("insight-theme")).toHaveCount(3);
  await expect(page.getByTestId("insights-stale")).toHaveCount(0);
  await expect(page.getByTestId("improve-count")).toHaveText("3 themes");
  const top = page.getByTestId("insight-theme").first();
  await expect(top.getByTestId("insight-priority")).toHaveText("high");
  await expect(top.getByTestId("insight-title")).toHaveText("Wrote the fix before writing a failing test");
  // The duplicate from another run lands in the same theme.
  const topIds = await top.getByTestId("insight-feedback-link").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-feedback-id"))));
  expect(topIds).toEqual([1, x3.id]);
  await expect(top.getByTestId("insight-evidence")).toContainText("2 feedback items");

  const stored = (await (await request.get("/api/kits/debug-kit/insights")).json()) as { feedbackCount: number; themes: unknown[]; stale: boolean };
  expect(stored).toMatchObject({ feedbackCount: 4, stale: false });
  expect(stored.themes).toHaveLength(3);

  // A run without corrections changes nothing; new feedback marks the insights stale.
  expect((await report(home, "transcript-debug-success.jsonl", "sess-002")).stdout.trim()).toBe("Reported 1 run(s)");
  await page.reload();
  await expect(page.getByTestId("insights-stale")).toHaveCount(0);
  expect((await request.post("/api/runs/report", { data: selfReport("MOCK:analyze-fail") })).status()).toBe(201);
  await page.reload();
  await expect(page.getByTestId("insights-stale")).toHaveText(/^1 new feedback item since this analysis\./);

  // A failed analysis keeps the previous insights.
  await page.getByTestId("analyze-button").click();
  await expect(page.getByTestId("insights-error")).toHaveText("Couldn't analyze feedback. Nothing was changed.");
  await expect(page.getByTestId("insight-theme")).toHaveCount(3);

  // Improve works from the insights; a hunk resolves every item in the theme it addresses.
  await page.goto("/inbox?kit=debug-kit");
  const noise = (await feedbackList(request, "?kit=debug-kit")).find((f) => f.text === "MOCK:analyze-fail")!;
  await page.locator(`[data-testid="inbox-item"][data-feedback-id="${noise.id}"]`).getByTestId("feedback-dismiss").click();
  await expect(page.locator(`[data-testid="inbox-item"][data-feedback-id="${noise.id}"]`)).toHaveCount(0);
  await page.goto("/kits/debug-kit?tab=insights");
  await page.getByTestId("analyze-button").click();
  await expect(page.getByTestId("insights-stale")).toHaveCount(0);
  await page.getByTestId("improve-button").click();
  await page.getByTestId("improve-submit").click();
  await expect(page).toHaveURL(/\/kits\/debug-kit\/proposals\/\d+$/);
  const skill = hunkForFile(page, "SKILL.md");
  const cited = await skill.getByTestId("hunk-feedback-link").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-feedback-id"))));
  expect(cited).toEqual([1, x3.id]);
  await skill.getByTestId("hunk-accept").click();
  await hunkForFile(page, "references/checklist.md").getByTestId("hunk-accept").click();
  await page.getByTestId("publish-button").click();
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.1.0");

  const after = await feedbackList(request, "?kit=debug-kit");
  for (const id of [1, 2, x3.id]) expect(after.find((f) => f.id === id)).toMatchObject({ status: "resolved", resolvedInVersion: "1.1.0" });
  expect(after.find((f) => f.text === "Good root-cause analysis")!.status).toBe("new");
});
