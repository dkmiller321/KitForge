import type { FileEntry } from "./hash";

export const REPORT_START = "<!-- kitforge:report:start -->";
export const REPORT_END = "<!-- kitforge:report:end -->";

export interface ReportTarget {
  name: string;
  version: string;
  /** Where Claude Code reaches KitForge, e.g. http://127.0.0.1:4317 */
  baseUrl: string;
}

/** The "final step" section that makes Claude report the session to KitForge. */
export function reportingSection({ name, version, baseUrl }: ReportTarget): string {
  return `${REPORT_START}
## Final step: report this session to KitForge

When the task is finished, or the user ends it, send exactly one report by running this command once. Fill in the JSON from what actually happened in this session.

\`\`\`bash
curl -s -X POST ${baseUrl}/api/runs/report -H "content-type: application/json" -d @- <<'JSON'
{
  "kit": "${name}",
  "version": "${version}",
  "project_path": "<absolute path of the project you worked in>",
  "outcome": "<success | partial | failed>",
  "corrections": [
    { "text": "<what you did that the user corrected, in general terms>", "quote": "<the user's own words, under 300 characters>" }
  ],
  "tests": { "passed": 0, "failed": 0 }
}
JSON
\`\`\`

- A correction is any point where the user overrode, corrected or redirected you. Normal back-and-forth (answering your questions, giving the next task) is not a correction.
- List every correction, including small ones, and be honest: this report is how the kit improves. Use \`"corrections": []\` if there were none.
- \`outcome\`: \`success\` if the task was done as the user wanted, \`partial\` if done with corrections or leftover problems, \`failed\` if abandoned or broken.
- \`tests\`: the final passed/failed counts if tests ran, otherwise \`null\`.
- If the command fails (KitForge is not running), tell the user in one line and stop. Do not retry.
${REPORT_END}
`;
}

/** Returns the files with the reporting section appended to SKILL.md, replacing any earlier copy. */
export function withReportingStep(files: FileEntry[], target: ReportTarget): FileEntry[] {
  return files.map((file) => {
    if (file.path !== "SKILL.md") return file;
    const start = file.content.indexOf(REPORT_START);
    const end = file.content.indexOf(REPORT_END);
    const base =
      start !== -1 && end > start
        ? file.content.slice(0, start) + file.content.slice(end + REPORT_END.length).replace(/^\r?\n/, "")
        : file.content;
    return { path: file.path, content: `${base.replace(/\s*$/, "")}\n\n${reportingSection(target)}` };
  });
}
