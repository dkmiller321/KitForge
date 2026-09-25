import { env } from "@/lib/env";
import { createOpenRouterLlm } from "./openrouter";
import { mockLlm } from "./mock";
import { extractionSchema, insightsSchema, proposalSchema, type KitLlm, type RawKitLlm } from "./schemas";

export type { KitLlm } from "./schemas";

/** Wraps an adapter so its output always passes the same zod validation. */
export function validated(raw: RawKitLlm): KitLlm {
  return {
    extractRun: async (transcript) => extractionSchema.parse(await raw.extractRun(transcript)),
    analyzeFeedback: async (input) => insightsSchema.parse(await raw.analyzeFeedback(input)),
    proposeImprovement: async (input) => proposalSchema.parse(await raw.proposeImprovement(input)),
  };
}

let instance: KitLlm | undefined;

export function getLlm(): KitLlm {
  instance ??= validated(env.KITFORGE_LLM_MODE === "mock" ? mockLlm : createOpenRouterLlm());
  return instance;
}
