import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { runKit, tmpHome } from "./helpers/cli";
import { fixtureFile, getJson, importDebugKit, pull, resetDb, type KitDto } from "./helpers/flows";
import { FIXTURES } from "./helpers/zip";

let home: string;

test.beforeEach(async ({ request }) => {
  await resetDb(request);
  home = tmpHome();
});

test("E2E-06 @stage2 pull installs files and manifest (L1, U3)", async ({ page, request }) => {
  await importDebugKit(page);
  const result = await pull(home);
  const dir = path.join(home, ".claude", "skills", "debug-kit");
  expect(result.stdout.trim()).toBe(`Installed debug-kit@1.0.0 to ${dir}`);

  for (const rel of ["SKILL.md", path.join("references", "checklist.md")]) {
    expect(fs.readFileSync(path.join(dir, rel)).equals(fs.readFileSync(path.join(FIXTURES, "debug-kit", rel)))).toBe(true);
  }
  const kit = await getJson<KitDto>(request, "/api/kits/debug-kit");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, ".kitforge.json"), "utf8"));
  expect(manifest).toEqual({ name: "debug-kit", version: "1.0.0", hash: kit.versions[0].contentHash });
});

test("E2E-07 @stage2 pull errors and clean install (L1)", async ({ page }) => {
  const missing = await runKit(["pull", "nope"], { home });
  expect(missing.code).toBe(1);
  expect(missing.stderr.trim()).toBe("Kit not found: nope");

  await importDebugKit(page);
  const badVersion = await runKit(["pull", "debug-kit@9.9.9"], { home });
  expect(badVersion.code).toBe(1);
  expect(badVersion.stderr.trim()).toBe("Version not found: debug-kit@9.9.9");

  const dir = path.join(home, ".claude", "skills", "debug-kit");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "old.md"), "stale");
  await pull(home);
  expect(fs.existsSync(path.join(dir, "old.md"))).toBe(false);
  expect(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")).toBe(fixtureFile("debug-kit", "SKILL.md"));
});

test("E2E-08 @stage2 list (L2)", async ({ page }) => {
  const empty = await runKit(["list"], { home });
  expect(empty.code).toBe(0);
  expect(empty.stdout.trim()).toBe("No kits installed");

  await importDebugKit(page);
  await pull(home);
  const listed = await runKit(["list"], { home });
  expect(listed.code).toBe(0);
  expect(listed.stdout.split("\n")).toContain("debug-kit 1.0.0 (latest 1.0.0)");
});
