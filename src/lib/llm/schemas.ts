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

export const PRIORITIES = ["high", "medium", "low"] as const;

export const insightsSchema = z.object({
  themes: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        problem: z.string().min(1),
        suggestion: z.string().min(1),
        priority: z.enum(PRIORITIES),
        feedback_ids: z.array(z.number().int().positive()).min(1),
      }),
    )
    .max(20),
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
export type Insights = z.infer<typeof insightsSchema>;
export type Theme = Insights["themes"][number];
export type Proposal = z.infer<typeof proposalSchema>;
export type ProposedEdit = Proposal["edits"][number];

export interface KitFile {
  path: string;
  content: string;
}

/** One feedback item as the analysis sees it. */
export interface FeedbackForAnalysis {
  id: number;
  kind: string;
  text: string;
  quote: string | null;
  rating: number | null;
  status: string;
  runCount: number;
  resolvedInVersion: string | null;
}

export interface AnalyzeInput {
  kit: string;
  version: string;
  files: KitFile[];
  feedback: FeedbackForAnalysis[];
}

export interface ProposeInput {
  files: KitFile[];
  themes: Theme[];
  instruction?: string;
}

/** What an adapter (mock or OpenRouter) returns before validation. */
export interface RawKitLlm {
  extractRun(transcript: string): Promise<unknown>;
  analyzeFeedback(input: AnalyzeInput): Promise<unknown>;
  proposeImprovement(input: ProposeInput): Promise<unknown>;
}

export interface KitLlm {
  extractRun(transcript: string): Promise<Extraction>;
  analyzeFeedback(input: AnalyzeInput): Promise<Insights>;
  proposeImprovement(input: ProposeInput): Promise<Proposal>;
}
