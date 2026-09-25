export type Outcome = "success" | "partial" | "failed";

export interface MetricsRun {
  version: string;
  outcome: Outcome;
  correctionCount: number;
}

export interface VersionMetrics {
  version: string;
  runs: number;
  successRate: number | null;
  correctionsPerRun: number | null;
}

/** Per-version run count, success rate (0–1) and mean corrections per run, in the order of `versions`. */
export function aggregateMetrics(versions: string[], runs: MetricsRun[]): VersionMetrics[] {
  return versions.map((version) => {
    const mine = runs.filter((r) => r.version === version);
    if (mine.length === 0) return { version, runs: 0, successRate: null, correctionsPerRun: null };
    const successes = mine.filter((r) => r.outcome === "success").length;
    const corrections = mine.reduce((sum, r) => sum + r.correctionCount, 0);
    return { version, runs: mine.length, successRate: successes / mine.length, correctionsPerRun: corrections / mine.length };
  });
}

export function successRate(outcomes: Outcome[]): number | null {
  return outcomes.length === 0 ? null : outcomes.filter((o) => o === "success").length / outcomes.length;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function formatCorrections(perRun: number | null): string {
  return perRun === null ? "—" : perRun.toFixed(1);
}
