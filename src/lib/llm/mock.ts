import type { Extraction, ProposeInput, Proposal, RawKitLlm } from "./schemas";

const DELAY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

const EXTRACTIONS: Record<string, Extraction> = {
  "debug-partial": {
    outcome: "partial",
    corrections: [
      { text: "Wrote the fix before writing a failing test", quote: "Stop — write the failing test first, then fix it." },
      {
        text: "Ran the full test suite instead of the single failing test",
        quote: "Only run the failing test, the full suite takes 10 minutes.",
      },
    ],
    tests: { passed: 3, failed: 1 },
  },
  "debug-success": { outcome: "success", corrections: [], tests: { passed: 4, failed: 0 } },
  "debug-dup": {
    outcome: "partial",
    corrections: [{ text: "Wrote the fix before the failing test again", quote: "Again: test first, then the fix." }],
    tests: { passed: 2, failed: 1 },
  },
  "feature-partial": {
    outcome: "partial",
    corrections: [{ text: "Edited the module without reading it first", quote: "Read the whole file before you touch it." }],
    tests: null,
  },
};

const DEFAULT_EXTRACTION: Extraction = { outcome: "success", corrections: [], tests: null };

export function mockExtraction(transcript: string): Extraction {
  const marker = /MOCK:([a-z0-9-]+)/.exec(transcript)?.[1];
  if (marker === "extract-fail") throw new Error("mock extraction failure");
  return (marker && EXTRACTIONS[marker]) || DEFAULT_EXTRACTION;
}

export function mockProposal({ feedback, instruction }: ProposeInput): Proposal {
  const ids = feedback.map((f) => f.id).sort((a, b) => a - b);
  const f0 = ids[0];
  const f1 = ids[1] ?? ids[0];
  const lowered = (instruction ?? "").toLowerCase();

  const testFirst = {
    file: "SKILL.md",
    find: "1. Reproduce the bug with a failing test before changing code.",
    replace: "1. Reproduce the bug with a failing test before changing any code. Never write the fix first.",
    rationale: "Make test-first explicit so the fix is never written first.",
    feedback_ids: [f0],
  };

  if (lowered.includes("mock:proposal-fail")) throw new Error("mock proposal failure");
  if (lowered.includes("mock:bad-hunk")) {
    return {
      edits: [
        testFirst,
        { file: "SKILL.md", find: "THIS LINE DOES NOT EXIST", replace: "x", rationale: "Invalid", feedback_ids: [f0] },
      ],
    };
  }
  if (lowered.includes("shorter")) {
    return {
      edits: [
        {
          file: "SKILL.md",
          find: "3. Fix the root cause, not the symptom.",
          replace: "3. Fix the root cause.",
          rationale: "Shorten rule 3.",
          feedback_ids: [f0],
        },
      ],
    };
  }
  return {
    edits: [
      testFirst,
      {
        file: "references/checklist.md",
        find: "- [ ] Failing test written",
        replace: "- [ ] Failing test written\n- [ ] Only the failing test run while iterating",
        rationale: "Keep iteration on the single failing test.",
        feedback_ids: [f1],
      },
    ],
  };
}

export const mockLlm: RawKitLlm = {
  async extractRun(transcript) {
    await wait();
    return mockExtraction(transcript);
  },
  async proposeImprovement(input) {
    await wait();
    return mockProposal(input);
  },
};
