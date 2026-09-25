import { z } from "zod";

export const QUOTE_MAX = 299;

export const extractionSchema = z.object({
  outcome: z.enum(["success", "partial", "failed"]),
  corrections: z.array(
    z.object({
      text: z.string().min(1),
      quote: z.string().min(1).max(QUOTE_MAX),
    }),
  ),
  tests: z
    .object({
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
    })
    .nullable(),
});

export const proposalSchema = z.object({
  edits: z.array(
    z.object({
      file: z.string().min(1),
      find: z.string().min(1),
      replace: z.string(),
      rationale: z.string().min(1),
      feedback_ids: z.array(z.number().int().positive()).min(1),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type ProposedEdit = Proposal["edits"][number];

export interface KitFile {
  path: string;
  content: string;
}

export interface FeedbackForLlm {
  id: number;
  text: string;
  quote: string | null;
}

export interface ProposeInput {
  files: KitFile[];
  feedback: FeedbackForLlm[];
  instruction?: string;
}

/** What an adapter (mock or Anthropic) returns before validation. */
export interface RawKitLlm {
  extractRun(transcript: string): Promise<unknown>;
  proposeImprovement(input: ProposeInput): Promise<unknown>;
}

export interface KitLlm {
  extractRun(transcript: string): Promise<Extraction>;
  proposeImprovement(input: ProposeInput): Promise<Proposal>;
}
