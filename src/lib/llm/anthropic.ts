import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import { extractionSchema, proposalSchema, QUOTE_MAX, type ProposeInput, type RawKitLlm } from "./schemas";

const EXTRACT_SYSTEM = `You review a trimmed Claude Code session transcript in which Claude followed a "kit" (a skill file of instructions).
Report the session outcome and every correction: a point where the user overrode, corrected or redirected Claude because it did something the user did not want.
Normal back-and-forth (answering Claude's questions, giving the next task, approving work) is NOT a correction.
For each correction give "text": a short, general description of what Claude did wrong, and "quote": the user's own words, verbatim, at most ${QUOTE_MAX} characters.
outcome: "success" if the task was completed as the user wanted, "partial" if completed with corrections or leftover problems, "failed" if abandoned or broken.
tests: the final passed/failed counts if the transcript reports test results, otherwise null.
Respond only by calling the record_run tool once.`;

const PROPOSE_SYSTEM = `You improve a Claude Code kit (a folder of Markdown instructions) using feedback from real runs.
Return find/replace edits against the given files by calling the propose_edits tool once.
Rules:
- "find" must be copied exactly from the file and must occur exactly once in it; keep it short (one line or a few lines).
- Prefer editing an existing rule over adding a new one; generalise instead of adding one-off rules.
- Each edit gets a one-line "rationale" and the ids of the feedback items it addresses in "feedback_ids".
- Only change what the feedback justifies. Never delete unrelated content.`;

function tool(name: string, description: string, schema: z.ZodType): Anthropic.Tool {
  const inputSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete inputSchema.$schema;
  return { name, description, input_schema: inputSchema as Anthropic.Tool.InputSchema };
}

const recordRun = tool("record_run", "Record the outcome and corrections of the session.", extractionSchema);
const proposeEdits = tool("propose_edits", "Propose find/replace edits to the kit files.", proposalSchema);

async function callTool(client: Anthropic, t: Anthropic.Tool, system: string, content: string): Promise<unknown> {
  const response = await client.messages.create({
    model: env.KITFORGE_MODEL as string,
    max_tokens: 16000,
    system,
    tools: [t],
    // Forced tool_choice ("tool"/"any") is rejected by current Claude models, so the
    // single tool is offered with "auto" and the system prompt requires calling it.
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content }],
  });
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === t.name,
  );
  if (!block) throw new Error(`Model did not call ${t.name} (stop_reason: ${response.stop_reason})`);
  return block.input;
}

function renderFiles({ files, feedback, instruction }: ProposeInput): string {
  const fileText = files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n\n");
  const feedbackText = feedback
    .map((f) => `- id ${f.id}: ${f.text}${f.quote ? ` (user said: "${f.quote}")` : ""}`)
    .join("\n");
  const extra = instruction ? `\n\nExtra instruction from the kit author: ${instruction}` : "";
  return `Kit files:\n\n${fileText}\n\nAccepted feedback:\n${feedbackText}${extra}`;
}

export function createAnthropicLlm(): RawKitLlm {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    extractRun: (transcript) => callTool(client, recordRun, EXTRACT_SYSTEM, `<transcript>\n${transcript}\n</transcript>`),
    proposeImprovement: (input) => callTool(client, proposeEdits, PROPOSE_SYSTEM, renderFiles(input)),
  };
}
