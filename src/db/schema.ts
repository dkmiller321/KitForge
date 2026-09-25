import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";

export const kits = sqliteTable("kits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  title: text("title").notNull(),
  currentVersionId: integer("current_version_id"),
});

export const kitVersions = sqliteTable(
  "kit_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kitId: integer("kit_id").notNull().references(() => kits.id),
    semver: text("semver").notNull(),
    parentVersionId: integer("parent_version_id"),
    contentHash: text("content_hash").notNull(),
    changelogMd: text("changelog_md").notNull(),
    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [uniqueIndex("kit_versions_kit_semver").on(t.kitId, t.semver)],
);

export const versionFiles = sqliteTable(
  "version_files",
  {
    versionId: integer("version_id").notNull().references(() => kitVersions.id),
    path: text("path").notNull(),
    content: text("content").notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.path] })],
);

export const runs = sqliteTable(
  "runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    kitId: integer("kit_id").notNull().references(() => kits.id),
    kitVersionId: integer("kit_version_id").notNull().references(() => kitVersions.id),
    projectPath: text("project_path").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at").notNull(),
    outcome: text("outcome", { enum: ["success", "partial", "failed"] }).notNull(),
    outcomeOverridden: integer("outcome_overridden", { mode: "boolean" }).notNull().default(false),
    testsPassed: integer("tests_passed"),
    testsFailed: integer("tests_failed"),
    createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [uniqueIndex("runs_session_kit").on(t.sessionId, t.kitId)],
);

export const feedbackStatuses = ["new", "accepted", "dismissed", "merged", "resolved"] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull().references(() => runs.id),
  kitId: integer("kit_id").notNull().references(() => kits.id),
  kind: text("kind", { enum: ["correction", "note", "rating"] }).notNull(),
  text: text("text").notNull(),
  quote: text("quote"),
  rating: integer("rating"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  status: text("status", { enum: feedbackStatuses }).notNull().default("new"),
  mergedIntoId: integer("merged_into_id"),
  resolvedInVersionId: integer("resolved_in_version_id"),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const proposals = sqliteTable("proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kitId: integer("kit_id").notNull().references(() => kits.id),
  baseVersionId: integer("base_version_id").notNull().references(() => kitVersions.id),
  feedbackIds: text("feedback_ids", { mode: "json" }).$type<number[]>().notNull(),
  instruction: text("instruction"),
  droppedCount: integer("dropped_count").notNull().default(0),
  status: text("status", { enum: ["draft", "published", "discarded"] }).notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const proposalHunks = sqliteTable("proposal_hunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proposalId: integer("proposal_id").notNull().references(() => proposals.id),
  position: integer("position").notNull(),
  filePath: text("file_path").notNull(),
  findText: text("find_text").notNull(),
  replaceText: text("replace_text").notNull(),
  editedReplace: text("edited_replace"),
  rationale: text("rationale").notNull(),
  feedbackIds: text("feedback_ids", { mode: "json" }).$type<number[]>().notNull(),
  decision: text("decision", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
});

export const ALL_TABLES = [
  "proposal_hunks",
  "proposals",
  "feedback",
  "runs",
  "version_files",
  "kit_versions",
  "kits",
] as const;
