import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import { resetDb } from "./helpers/flows";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("E2E-00 @stage0 app and CLI boot", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true, llmMode: "mock" });

  await page.goto("/");
  await expect(page.getByTestId("library-empty")).toHaveText("No kits yet");
  await expect(page.getByTestId("import-button")).toBeVisible();

  const reset = await request.post("/api/test/reset");
  expect(reset.status()).toBe(200);

  const help = await runKit(["--help"], { home: tmpHome() });
  expect(help.code).toBe(0);
  for (const command of ["pull", "list", "hook", "report", "note"]) expect(help.stdout).toContain(command);
});
