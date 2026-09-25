import { z } from "zod";
import { env } from "@/lib/env";
import {
  extractionSchema,
  insightsSchema,
  proposalSchema,
  QUOTE_MAX,
  type AnalyzeInput,
  type KitFile,
  type ProposeInput,
  type RawKitLlm,
} from "./schemas";

const TIMEOUT_MS = 180_000;

const EXTRACT_SYSTEM = `You review a trimmed Claude Code session transcript in which Claude followed a "kit" (a skill file of instructions).
Report the session outcome and every correction: a point where the user overrode, corrected or redirected Claude because it did something the user did not want.
Normal back-and-forth (answering Claude's questions, giving the next task, approving work) is NOT a correction.
For each correction give "text": a short, general description of what Claude did wrong, and "quote": the user's own words, verbatim, at most ${QUOTE_MAX} characters.
outcome: "success" if the task was completed as the user wanted, "partial" if completed with corrections or leftover problems, "failed" if abandoned or broken.
tests: the final passed/failed counts if the transcript reports test results, otherwise null.
Respond only by calling the record_run tool once.`;

const ANALYZE_SYSTEM = `You analyse every piece of feedback collected from real runs of a Claude Code "kit" (a folder of Markdown instructions that Claude follows) and turn it into a short, ranked list of themes that should drive the next version of the kit.
Rules:
- Merge feedback that describes the same underlying problem into one theme, even when the wording differs. Every theme cites the ids of all feedback it covers in "feedback_ids".
- Rank by impact: how often it happened, how much it cost (time, user intervention, broken output), and whether it recurred after being marked resolved. Use "priority" high / medium / low.
- "problem": what goes wrong and why, in one or two sentences grounded in the feedback.
- "suggestion": the concrete change to the kit's files that would prevent it (which file, what rule to add or change). Prefer editing an existing rule over adding a new one, and generalise rather than adding one-off rules.
- Feedback that praises something that worked is not a problem: keep it only if it suggests a rule worth making explicit.
- Skip feedback that is noise or has nothing to do with the kit. Return at most 12 themes.
Respond only by calling the record_insights tool once.`;

const PROPOSE_SYSTEM = `You improve a Claude Code kit (a folder of Markdown instructions) using themes distilled from feedback on real runs.
Return find/replace edits against the given files by calling the propose_edits tool once.
Rules:
- "find" must be copied exactly from the file and must occur exactly once in it; keep it short (one line or a few lines).
- To add new text, find an existing line next to where it belongs and replace it with that line plus the new text.
- Prefer editing an existing rule over adding a new one; generalise instead of adding one-off rules.
- Each edit gets a one-line "rationale" and, in "feedback_ids", the feedback ids of the theme(s) it addresses.
- Address the highest-priority themes first. Only change what the themes justify. Never delete unrelated content.`;

interface ToolSpec {
  name: string;
  description: string;
  schema: z.ZodType;
}

const RECORD_RUN: ToolSpec = { name: "record_run", description: "Record the outcome and corrections of the session.", schema: extractionSchema };
const RECORD_INSIGHTS: ToolSpec = { name: "record_insights", description: "Record the ranked themes found in the feedback.", schema: insightsSchema };
const PROPOSE_EDITS: ToolSpec = { name: "propose_edits", description: "Propose find/replace edits to the kit files.", schema: proposalSchema };

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

interface ChatResponse {
  choices?: {
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
  }[];
  error?: { message?: string };
}

/**
 * Pulls the tool's JSON arguments out of an OpenAI-style chat completion. Falls back to JSON in the message
 * text (optionally fenced) for models that answer in text instead of calling the tool.
 */
export function parseToolOutput(response: ChatResponse, toolName: string): unknown {
  const choice = response.choices?.[0];
  const message = choice?.message;
  if (choice?.finish_reason === "length") throw new SyntaxError(`${toolName} output was cut off at the token limit`);
  const call = message?.tool_calls?.find((c) => c.function?.name === toolName) ?? message?.tool_calls?.[0];
  if (call?.function?.arguments) return JSON.parse(call.function.arguments);
  const text = message?.content?.trim();
  if (text) {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
    const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    if (candidate) return JSON.parse(candidate);
  }
  throw new SyntaxError(`Model returned no ${toolName} output`);
}

async function callTool(tool: ToolSpec, system: string, content: string): Promise<unknown> {
  const res = await fetch(`${env.OPENROUTER_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "x-title": "KitForge",
    },
    body: JSON.stringify({
      model: env.KITFORGE_MODEL,
      max_tokens: 16000,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: jsonSchema(tool.schema) } }],
      // Forcing a specific tool is rejected by some current models, so the one tool is offered with "auto"
      // and the system prompt requires calling it; parseToolOutput also accepts a JSON text answer.
      tool_choice: "auto",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as ChatResponse;
  if (!res.ok || body.error) throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? "request failed"}`);
  return parseToolOutput(body, tool.name);
}

function renderFiles(files: KitFile[]): string {
  return files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n\n");
}

function renderAnalyze({ kit, version, files, feedback }: AnalyzeInput): string {
  const items = feedback
    .map((f) => {
      const meta = [`id ${f.id}`, f.kind, `${f.runCount} run(s)`, f.status === "resolved" ? `resolved in ${f.resolvedInVersion}` : f.status];
      if (f.rating !== null) meta.push(`rating ${f.rating}/5`);
      return `<feedback ${meta.join(" | ")}>\n${f.text}${f.quote ? `\nUser said: "${f.quote}"` : ""}\n</feedback>`;
    })
    .join("\n");
  return `Kit ${kit}, current version ${version}.\n\nKit files:\n\n${renderFiles(files)}\n\nAll feedback (${feedback.length} items):\n${items}`;
}

function renderPropose({ files, themes, instruction }: ProposeInput): string {
  const list = themes
    .map((t, i) => `${i + 1}. [${t.priority}] ${t.title} (feedback ${t.feedback_ids.map((id) => `#${id}`).join(", ")})\n   Problem: ${t.problem}\n   Suggested change: ${t.suggestion}`)
    .join("\n");
  const extra = instruction ? `\n\nExtra instruction from the kit author: ${instruction}` : "";
  return `Kit files:\n\n${renderFiles(files)}\n\nThemes to address, highest priority first:\n${list}${extra}`;
}

export function createOpenRouterLlm(): RawKitLlm {
  return {
    extractRun: (transcript) => callTool(RECORD_RUN, EXTRACT_SYSTEM, `<transcript>\n${transcript}\n</transcript>`),
    analyzeFeedback: (input) => callTool(RECORD_INSIGHTS, ANALYZE_SYSTEM, renderAnalyze(input)),
    proposeImprovement: (input) => callTool(PROPOSE_EDITS, PROPOSE_SYSTEM, renderPropose(input)),
  };
}
