import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4317";
const smoke = process.env.RUN_SMOKE === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  // `npm run test:e2e` runs everything except @smoke; the smoke suite runs only with RUN_SMOKE=1.
  grepInvert: smoke ? undefined : /@smoke/,
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Smoke specs start their own real-mode server, so no mock server is started for them.
  webServer:
    process.env.BASE_URL || smoke
      ? undefined
      : {
          command: "npm run dev",
          url: `${baseURL}/api/health`,
          timeout: 180_000,
          // Never reuse a server we did not start: /api/test/reset would wipe its database.
          reuseExistingServer: false,
          stdout: "ignore",
          stderr: "pipe",
          env: {
            KITFORGE_LLM_MODE: "mock",
            KITFORGE_HOST: "127.0.0.1",
            KITFORGE_PORT: "4317",
            KITFORGE_DB_PATH: ".data/e2e.db",
          },
        },
});
