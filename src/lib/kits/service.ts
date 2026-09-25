import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback, kitVersions, kits, runs, versionFiles } from "@/db/schema";
import { aggregateMetrics, successRate, type VersionMetrics } from "@/lib/metrics";
import { listRuns } from "@/lib/runs/service";
import { contentHash, sortFiles, type FileEntry } from "./hash";
import type { ParsedKit } from "./parse";
import { compareSemver, nextVersion, type Bump } from "./semver";

export class KitError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface KitSummary {
  name: string;
  title: string;
  currentVersion: string;
  runCount: number;
  successRate: number | null;
}

export interface VersionInfo {
  id: number;
  semver: string;
  contentHash: string;
  changelogMd: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface KitDetail {
  id: number;
  name: string;
  title: string;
  currentVersion: string;
  currentVersionId: number;
  versions: VersionInfo[];
}

export function listKits(): KitSummary[] {
  const db = getDb();
  const rows = db
    .select({ id: kits.id, name: kits.name, title: kits.title, currentVersion: kitVersions.semver })
    .from(kits)
    .innerJoin(kitVersions, eq(kitVersions.id, kits.currentVersionId))
    .orderBy(asc(kits.name))
    .all();
  const outcomes = db.select({ kitId: runs.kitId, outcome: runs.outcome }).from(runs).all();
  return rows.map((k) => {
    const mine = outcomes.filter((r) => r.kitId === k.id).map((r) => r.outcome);
    return { name: k.name, title: k.title, currentVersion: k.currentVersion, runCount: mine.length, successRate: successRate(mine) };
  });
}

export function getKit(name: string): KitDetail | null {
  const db = getDb();
  const kit = db.select().from(kits).where(eq(kits.name, name)).get();
  if (!kit || kit.currentVersionId === null) return null;
  const versions = db
    .select()
    .from(kitVersions)
    .where(eq(kitVersions.kitId, kit.id))
    .all()
    .sort((a, b) => compareSemver(b.semver, a.semver));
  const current = versions.find((v) => v.id === kit.currentVersionId)!;
  return {
    id: kit.id,
    name: kit.name,
    title: kit.title,
    currentVersion: current.semver,
    currentVersionId: current.id,
    versions: versions.map((v) => ({
      id: v.id,
      semver: v.semver,
      contentHash: v.contentHash,
      changelogMd: v.changelogMd,
      createdAt: v.createdAt,
      isCurrent: v.id === kit.currentVersionId,
    })),
  };
}

export function requireKit(name: string): KitDetail {
  const kit = getKit(name);
  if (!kit) throw new KitError("kit_not_found", 404);
  return kit;
}

export function filesForVersion(versionId: number): FileEntry[] {
  const rows = getDb()
    .select({ path: versionFiles.path, content: versionFiles.content })
    .from(versionFiles)
    .where(eq(versionFiles.versionId, versionId))
    .all();
  return sortFiles(rows);
}

/** Files of a version (current when omitted), as served to `kit pull`. */
export function getVersionFiles(name: string, semver?: string) {
  const kit = requireKit(name);
  const version = semver ? kit.versions.find((v) => v.semver === semver) : kit.versions.find((v) => v.isCurrent);
  if (!version) throw new KitError("version_not_found", 404);
  return { name: kit.name, version: version.semver, contentHash: version.contentHash, files: filesForVersion(version.id) };
}

/** Inserts a new immutable version with its files. Must run inside a transaction. */
export function insertVersion(kitId: number, semver: string, parentVersionId: number | null, files: FileEntry[], changelogMd: string): number {
  const db = getDb();
  const version = db
    .insert(kitVersions)
    .values({ kitId, semver, parentVersionId, contentHash: contentHash(files), changelogMd })
    .returning({ id: kitVersions.id })
    .get();
  for (const file of sortFiles(files)) db.insert(versionFiles).values({ versionId: version.id, path: file.path, content: file.content }).run();
  return version.id;
}

export function importKit(parsed: ParsedKit): KitDetail {
  const db = getDb();
  if (db.select({ id: kits.id }).from(kits).where(eq(kits.name, parsed.name)).get()) {
    throw new KitError("kit_exists", 409, `A kit named ${parsed.name} already exists.`);
  }
  db.transaction(() => {
    const kit = db.insert(kits).values({ name: parsed.name, title: parsed.title }).returning({ id: kits.id }).get();
    const versionId = insertVersion(kit.id, "1.0.0", null, parsed.files, "- Imported");
    db.update(kits).set({ currentVersionId: versionId }).where(eq(kits.id, kit.id)).run();
  });
  return requireKit(parsed.name);
}

export function setCurrentVersion(name: string, semver: string): KitDetail {
  const kit = requireKit(name);
  const version = kit.versions.find((v) => v.semver === semver);
  if (!version) throw new KitError("version_not_found", 404);
  getDb().update(kits).set({ currentVersionId: version.id }).where(eq(kits.id, kit.id)).run();
  return requireKit(name);
}

/** K8: a manual edit in the browser becomes a new version on top of the current one. */
export function createManualVersion(name: string, changes: FileEntry[], changelog: string, bump: Bump): KitDetail {
  const kit = requireKit(name);
  const base = filesForVersion(kit.currentVersionId);
  const byPath = new Map(base.map((f) => [f.path, f.content]));
  for (const change of changes) {
    if (!byPath.has(change.path)) throw new KitError("file_not_found", 400);
    byPath.set(change.path, change.content);
  }
  const files = [...byPath.entries()].map(([path, content]) => ({ path, content }));
  if (contentHash(files) === kit.versions.find((v) => v.isCurrent)!.contentHash) throw new KitError("no_changes", 400);
  const semver = nextVersion(kit.versions.map((v) => v.semver), bump);
  const lines = changelog
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^-\s*/, ""))
    .filter(Boolean)
    .map((l) => `- ${l}`);
  const db = getDb();
  db.transaction(() => {
    const versionId = insertVersion(kit.id, semver, kit.currentVersionId, files, lines.length ? lines.join("\n") : "- Manual edit");
    db.update(kits).set({ currentVersionId: versionId }).where(eq(kits.id, kit.id)).run();
  });
  return requireKit(name);
}

export function createBlankKit(name: string): KitDetail {
  const title = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const skill = `---\nname: ${name}\ndescription: Describe when Claude Code should use this kit.\n---\n\n# ${title}\n\n1. First rule.\n`;
  return importKit({ name, title, files: [{ path: "SKILL.md", content: skill }] });
}

export function acceptedCount(kitId: number): number {
  const row = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(feedback)
    .where(and(eq(feedback.kitId, kitId), eq(feedback.status, "accepted")))
    .get();
  return row?.n ?? 0;
}

export function versionSemvers(ids: number[]): Map<number, string> {
  if (ids.length === 0) return new Map();
  const rows = getDb().select({ id: kitVersions.id, semver: kitVersions.semver }).from(kitVersions).where(inArray(kitVersions.id, ids)).all();
  return new Map(rows.map((r) => [r.id, r.semver]));
}

export function kitNames(): string[] {
  return getDb().select({ name: kits.name }).from(kits).orderBy(asc(kits.name)).all().map((k) => k.name);
}

/** M1: metrics for every version of a kit, newest version first. */
export function kitMetrics(name: string): VersionMetrics[] {
  const kit = requireKit(name);
  const runs = listRuns(name).map((r) => ({ version: r.version, outcome: r.outcome, correctionCount: r.correctionCount }));
  return aggregateMetrics(kit.versions.map((v) => v.semver), runs);
}
