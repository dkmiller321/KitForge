import type { RunDto } from "@/lib/runs/service";
import { OutcomeSelect } from "./outcome-select";

const OUTCOME_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

export function RunsTab({ runs }: { runs: RunDto[] }) {
  if (runs.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No runs reported yet. Install the SessionEnd hook with <code className="font-mono">kit hook install</code>.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Run</th>
            <th className="px-4 py-2 font-medium">Version</th>
            <th className="px-4 py-2 font-medium">Outcome</th>
            <th className="px-4 py-2 font-medium">Corrections</th>
            <th className="px-4 py-2 font-medium">Tests</th>
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-4 py-2 font-medium">Ended</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} data-testid="run-row" data-run-id={run.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2 font-mono text-xs">#{run.id}</td>
              <td className="px-4 py-2 font-mono text-xs" data-testid="run-version">
                {run.version}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span data-testid="run-outcome" className={`rounded px-1.5 py-0.5 text-xs font-medium ${OUTCOME_STYLE[run.outcome]}`}>
                    {run.outcome}
                  </span>
                  <OutcomeSelect runId={run.id} outcome={run.outcome} />
                </div>
              </td>
              <td className="px-4 py-2 tabular-nums" data-testid="run-corrections">
                {run.correctionCount}
              </td>
              <td className="px-4 py-2 text-xs" data-testid="run-tests">
                {run.testsPassed === null || run.testsFailed === null ? "—" : `${run.testsPassed} passed, ${run.testsFailed} failed`}
              </td>
              <td className="max-w-[16rem] truncate px-4 py-2 font-mono text-xs text-muted-foreground" title={run.projectPath}>
                {run.projectPath}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(run.endedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
