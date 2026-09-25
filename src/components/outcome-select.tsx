"use client";

import { useRouter } from "next/navigation";

export function OutcomeSelect({ runId, outcome }: { runId: number; outcome: string }) {
  const router = useRouter();
  return (
    <select
      data-testid="run-outcome-select"
      aria-label="Override outcome"
      className="rounded border border-input bg-background px-1 py-0.5 text-xs"
      value={outcome}
      onChange={async (e) => {
        await fetch(`/api/runs/${runId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: e.target.value }),
          // Finish the save even if the user navigates away straight after choosing.
          keepalive: true,
        });
        router.refresh();
      }}
    >
      <option value="success">success</option>
      <option value="partial">partial</option>
      <option value="failed">failed</option>
    </select>
  );
}
