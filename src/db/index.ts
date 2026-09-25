import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function open(): Db {
  fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
  const sqlite = new Database(env.dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
  return db;
}

const globalForDb = globalThis as unknown as { kitforgeDb?: Db };

export function getDb(): Db {
  globalForDb.kitforgeDb ??= open();
  return globalForDb.kitforgeDb;
}

export function resetDb(): void {
  const sqlite = getDb().$client;
  sqlite.transaction(() => {
    for (const table of schema.ALL_TABLES) sqlite.prepare(`DELETE FROM ${table}`).run();
    sqlite.prepare("DELETE FROM sqlite_sequence").run();
  })();
}
