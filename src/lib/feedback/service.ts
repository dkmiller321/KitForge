import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feedback } from "@/db/schema";

export function countNewFeedback(): number {
  const row = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(feedback)
    .where(eq(feedback.status, "new"))
    .get();
  return row?.n ?? 0;
}
