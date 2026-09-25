import fs from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { runKit, type KitResult } from "./cli";
import { TRANSCRIPTS, writeTranscript, type TranscriptName, type TranscriptObject } from "./transcript";
import { FIXTURES, fixtureZip, type FixtureZip } from "./zip";

export const X1 = [
  { text: "Wrote the fix before writing a failing test", quote: "Stop — write the failing test first, then fix it." },
  {
    text: "Ran the full test suite instead of the single failing test",
    quote: "Only run the failing test, the full suite takes 10 minutes.",
  },
] as const;
export const X3_TEXT = "Wrote the fix before the failing test again";

export interface FeedbackDto {
  id: number;
  runIds: number[];
  kitName: string;
  kind: string;
  text: string;
  quote: string | null;
  rating: number | null;
  tags: string[];
  status: string;
  mergedIntoId: number | null;
  resolvedInVersion: string | null;
}

export interface RunDto {
  id: number;
  sessionId: string;
  kitName: string;
  version: string;
  projectPath: string;
  outcome: string;
  correctionCount: number;
  testsPassed: number | null;
  testsFailed: number | null;
}

export interface KitDto {
  name: string;
  currentVersion: string;
  versions: { semver: string; contentHash: string; changelogMd: string; createdAt: string; isCurrent: boolean }[];
}

export async function resetDb(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/test/reset");
  expect(res.status()).toBe(200);
}

export async function getJson<T>(request: APIRequestContext, url: string): Promise<T> {
  const res = await request.get(url);
  expect(res.ok(), `${url} → ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

export const kitCard = (page: Page, name: string) => page.locator(`[data-testid="kit-card"][data-kit-name="${name}"]`);
export const inboxItem = (page: Page, id: number) => page.locator(`[data-testid="inbox-item"][data-feedback-id="${id}"]`);
export const versionRow = (page: Page, v: string) => page.locator(`[data-testid="version-row"][data-version="${v}"]`);
export const metricsRow = (page: Page, v: string) => page.locator(`[data-testid="metrics-row"][data-version="${v}"]`);
export const hunkForFile = (page: Page, file: string) => page.locator(`[data-testid="proposal-hunk"][data-file="${file}"]`);

/** On `/`: open the import dialog, choose a fixture zip, submit. Does not assert the outcome. */
export async function importZip(page: Page, zip: FixtureZip): Promise<void> {
  await page.goto("/");
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-file").setInputFiles(fixtureZip(zip));
  await page.getByTestId("import-submit").click();
}

export async function importDebugKit(page: Page): Promise<void> {
  await importZip(page, "debug-kit.zip");
  await expect(kitCard(page, "debug-kit")).toBeVisible();
}

export async function importFeatureKitFolder(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("import-button").click();
  await page.getByTestId("import-path").fill(path.join(FIXTURES, "feature-kit"));
  await page.getByTestId("import-submit").click();
  await expect(kitCard(page, "new-feature-kit")).toBeVisible();
}

export async function pull(home: string, spec = "debug-kit"): Promise<KitResult> {
  const result = await runKit(["pull", spec], { home });
  expect(result.code, result.stderr).toBe(0);
  return result;
}

/** Copies a transcript into the home and runs `kit report` with a SessionEnd payload on stdin. */
export async function report(
  home: string,
  transcript: TranscriptName | TranscriptObject[],
  sessionId: string,
  env?: Record<string, string>,
): Promise<KitResult> {
  const lines = typeof transcript === "string" ? [...TRANSCRIPTS[transcript]] : transcript;
  const file = writeTranscript(home, `${sessionId}.jsonl`, lines);
  return runKit(["report"], {
    home,
    env,
    stdin: JSON.stringify({ session_id: sessionId, transcript_path: file, cwd: "/tmp/proj-a", hook_event_name: "SessionEnd", reason: "exit" }),
  });
}

export async function reportPartial(home: string, env?: Record<string, string>): Promise<KitResult> {
  return report(home, "transcript-debug-partial.jsonl", "sess-001", env);
}

/** E2E-10's setup: import debug-kit, pull, report partial as sess-001. */
export async function setupReported(page: Page, home: string): Promise<void> {
  await importDebugKit(page);
  await pull(home);
  const result = await reportPartial(home);
  expect(result.stdout.trim()).toBe("Reported 1 run(s)");
}

export async function feedbackList(request: APIRequestContext, query = ""): Promise<FeedbackDto[]> {
  return getJson<FeedbackDto[]>(request, `/api/feedback${query}`);
}

/** F1 and F2: the ids of the two X1 items, in id order. */
export async function x1Ids(request: APIRequestContext): Promise<[number, number]> {
  const items = await feedbackList(request, "?kit=debug-kit");
  const f1 = items.find((f) => f.text === X1[0].text);
  const f2 = items.find((f) => f.text === X1[1].text);
  expect(f1 && f2).toBeTruthy();
  return [f1!.id, f2!.id];
}

export async function setStatusViaApi(request: APIRequestContext, id: number, status: string): Promise<void> {
  const res = await request.patch(`/api/feedback/${id}`, { data: { status } });
  expect(res.ok()).toBeTruthy();
}

/** Accept F1 and F2 through the inbox UI. */
export async function acceptInInbox(page: Page, ids: number[]): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  for (const id of ids) {
    await inboxItem(page, id).getByTestId("feedback-accept").click();
    await expect(inboxItem(page, id)).toHaveCount(0);
  }
}

/** Opens the kit, runs Improve (optionally with an instruction) and waits for the proposal page. */
export async function improve(page: Page, instruction?: string): Promise<void> {
  await page.goto("/kits/debug-kit");
  await page.getByTestId("improve-button").click();
  if (instruction) await page.getByTestId("improve-instruction").fill(instruction);
  await page.getByTestId("improve-submit").click();
}

/** E2E-18's setup up to "both hunks shown". Returns F1, F2. */
export async function setupProposal(page: Page, request: APIRequestContext, home: string): Promise<[number, number]> {
  await setupReported(page, home);
  const ids = await x1Ids(request);
  await acceptInInbox(page, ids);
  await improve(page);
  await expect(page).toHaveURL(/\/kits\/debug-kit\/proposals\/\d+$/);
  await expect(page.getByTestId("proposal-hunk")).toHaveCount(2);
  return ids;
}

/** E2E-19 steps 1–2: publish 1.1.0 from both hunks. Returns F1, F2. */
export async function setupPublished(page: Page, request: APIRequestContext, home: string): Promise<[number, number]> {
  const ids = await setupProposal(page, request, home);
  await hunkForFile(page, "SKILL.md").getByTestId("hunk-accept").click();
  await hunkForFile(page, "references/checklist.md").getByTestId("hunk-accept").click();
  await expect(page.getByTestId("bump-select")).toHaveValue("minor");
  await page.getByTestId("publish-button").click();
  await expect(page).toHaveURL(/\/kits\/debug-kit$/);
  await expect(page.getByTestId("kit-current-version")).toHaveText("1.1.0");
  return ids;
}

export function fixtureFile(...parts: string[]): string {
  return fs.readFileSync(path.join(FIXTURES, ...parts), "utf8");
}

export function outboxFiles(home: string): string[] {
  const dir = path.join(home, ".kitforge", "outbox");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
}
