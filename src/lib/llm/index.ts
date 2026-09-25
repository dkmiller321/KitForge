import type { z } from "zod";
import { env } from "@/lib/env";
import { createOpenRouterLlm } from "./openrouter";
import { mockLlm } from "./mock";
import { extractionSchema, insightsSchema, proposalSchema, type KitLlm, type RawKitLlm } from "./schemas";

export type { KitLlm } from "./schemas";

/** Thrown for model output that isn't valid JSON or doesn't match the schema: worth another attempt. */
export class MalformedOutputError extends Error {}

const ATTEMPTS = 3;

/**
 * Runs one LLM call and validates its output. Only malformed output is retried (small models occasionally emit
 * broken JSON); network/HTTP errors fail at once. The mock never produces malformed output.
 */
async function validatedCall<S extends z.ZodType>(schema: S, call: () => Promise<unknown>, label: string): Promise<z.infer<S>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const parsed = schema.safeParse(await call());
      if (parsed.success) return parsed.data;
      throw new MalformedOutputError(`output didn't match the schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    } catch (err) {
      const malformed = err instanceof MalformedOutputError || err instanceof SyntaxError;
      if (!malformed || attempt >= ATTEMPTS) throw err;
      console.error(`[kitforge] ${label}: malformed output on attempt ${attempt} (${(err as Error).message}); retrying`);
    }
  }
}

/** Wraps an adapter so its output always passes the same zod validation. */
export function validated(raw: RawKitLlm): KitLlm {
  return {
    extractRun: (transcript) => validatedCall(extractionSchema, () => raw.extractRun(transcript), "extraction"),
    analyzeFeedback: (input) => validatedCall(insightsSchema, () => raw.analyzeFeedback(input), "analysis"),
    proposeImprovement: (input) => validatedCall(proposalSchema, () => raw.proposeImprovement(input), "proposal"),
  };
}

let instance: KitLlm | undefined;

export function getLlm(): KitLlm {
  instance ??= validated(env.KITFORGE_LLM_MODE === "mock" ? mockLlm : createOpenRouterLlm());
  return instance;
}
