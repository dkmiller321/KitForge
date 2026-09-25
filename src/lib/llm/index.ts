import { env } from "@/lib/env";
import { createAnthropicLlm } from "./anthropic";
import { mockLlm } from "./mock";
import { extractionSchema, proposalSchema, type KitLlm, type RawKitLlm } from "./schemas";

export type { KitLlm } from "./schemas";

/** Wraps an adapter so its output always passes the same zod validation. */
export function validated(raw: RawKitLlm): KitLlm {
  return {
    extractRun: async (transcript) => extractionSchema.parse(await raw.extractRun(transcript)),
    proposeImprovement: async (input) => proposalSchema.parse(await raw.proposeImprovement(input)),
  };
}

let instance: KitLlm | undefined;

export function getLlm(): KitLlm {
  instance ??= validated(env.KITFORGE_LLM_MODE === "mock" ? mockLlm : createAnthropicLlm());
  return instance;
}
