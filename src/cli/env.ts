import { z } from "zod";

const schema = z.object({
  KITFORGE_URL: z.string().url().default("http://127.0.0.1:4317"),
  KITFORGE_REPORT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export const cliEnv = schema.parse({
  KITFORGE_URL: process.env.KITFORGE_URL || undefined,
  KITFORGE_REPORT_TIMEOUT_MS: process.env.KITFORGE_REPORT_TIMEOUT_MS || undefined,
});

export const baseUrl = cliEnv.KITFORGE_URL.replace(/\/+$/, "");
