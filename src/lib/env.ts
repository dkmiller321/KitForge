import os from "node:os";
import path from "node:path";
import { z } from "zod";

const schema = z
  .object({
    KITFORGE_HOST: z.string().default("127.0.0.1"),
    KITFORGE_PORT: z.coerce.number().int().positive().default(4317),
    KITFORGE_DB_PATH: z.string().default("~/.kitforge/kitforge.db"),
    KITFORGE_LLM_MODE: z.enum(["mock", "real"]).default("mock"),
    ANTHROPIC_API_KEY: z.string().optional(),
    KITFORGE_MODEL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.KITFORGE_LLM_MODE !== "real") return;
    if (!env.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "required when KITFORGE_LLM_MODE=real" });
    }
    if (!env.KITFORGE_MODEL) {
      ctx.addIssue({ code: "custom", path: ["KITFORGE_MODEL"], message: "required when KITFORGE_LLM_MODE=real" });
    }
  });

export type Env = z.infer<typeof schema>;

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

function load(): Env & { dbPath: string } {
  const raw = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid KitForge environment: ${issues}`);
  }
  return { ...parsed.data, dbPath: expandHome(parsed.data.KITFORGE_DB_PATH) };
}

export const env = load();

/** Where Claude Code on this machine reaches KitForge (used in the kit's reporting step). */
export const appUrl = `http://${env.KITFORGE_HOST}:${env.KITFORGE_PORT}`;
