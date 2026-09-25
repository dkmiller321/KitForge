import Link from "next/link";
import { formatCorrections, formatPercent, type VersionMetrics } from "@/lib/metrics";

export function MetricsTab({ kit, metrics }: { kit: string; metrics: VersionMetrics[] }) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Runs</th>
              <th className="px-4 py-2 font-medium">Success rate</th>
              <th className="px-4 py-2 font-medium">Corrections / run</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.version} data-testid="metrics-row" data-version={m.version} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs">{m.version}</td>
                <td className="px-4 py-2 tabular-nums" data-testid="metric-runs">
                  {m.runs}
                </td>
                <td className="px-4 py-2 tabular-nums" data-testid="metric-success">
                  {formatPercent(m.successRate)}
                </td>
                <td className="px-4 py-2 tabular-nums" data-testid="metric-corrections">
                  {formatCorrections(m.correctionsPerRun)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {metrics.length >= 2 && (
        <Link
          data-testid="compare-link"
          href={`/kits/${kit}/compare?a=${metrics[1].version}&b=${metrics[0].version}`}
          className="inline-block text-sm text-forge hover:underline"
        >
          Compare {metrics[1].version} with {metrics[0].version} →
        </Link>
      )}
    </div>
  );
}
