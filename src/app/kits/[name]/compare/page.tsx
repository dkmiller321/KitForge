import Link from "next/link";
import { notFound } from "next/navigation";
import { getKit, kitMetrics } from "@/lib/kits/service";
import { formatCorrections, formatPercent, type VersionMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** M2: two versions side by side. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { name } = await params;
  const query = await searchParams;
  const kit = getKit(name);
  if (!kit) notFound();
  const metrics = kitMetrics(name);
  const pick = (v: string | undefined, fallback: VersionMetrics | undefined) => metrics.find((m) => m.version === v) ?? fallback;
  const a = pick(query.a, metrics[1] ?? metrics[0])!;
  const b = pick(query.b, metrics[0])!;

  const delta = (x: number | null, y: number | null) => (x === null || y === null ? null : y - x);
  const successDelta = delta(a.successRate, b.successRate);
  const correctionsDelta = delta(a.correctionsPerRun, b.correctionsPerRun);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/kits/${name}?tab=metrics`} className="text-sm text-muted-foreground hover:text-foreground">
          ← {name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Compare versions</h1>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <VersionSelect name="a" label="Baseline version" value={a.version} options={metrics.map((m) => m.version)} />
          <span className="text-muted-foreground">vs</span>
          <VersionSelect name="b" label="Compared version" value={b.version} options={metrics.map((m) => m.version)} />
          <button type="submit" className="rounded-md border border-input px-2 py-1 hover:bg-muted">
            Compare
          </button>
        </form>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Column testId="compare-a" m={a} />
        <Column testId="compare-b" m={b} />
      </div>
      {(successDelta !== null || correctionsDelta !== null) && (
        <p className="text-sm text-muted-foreground">
          {successDelta !== null && (
            <>
              Success rate {successDelta >= 0 ? "+" : ""}
              {Math.round(successDelta * 100)} points.{" "}
            </>
          )}
          {correctionsDelta !== null && (
            <>
              Corrections per run {correctionsDelta <= 0 ? "" : "+"}
              {correctionsDelta.toFixed(1)}.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function VersionSelect({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  return (
    <select name={name} aria-label={label} defaultValue={value} className="rounded-md border border-input bg-background px-2 py-1 font-mono">
      {options.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function Column({ testId, m }: { testId: string; m: VersionMetrics }) {
  return (
    <section data-testid={testId} className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-mono text-lg font-semibold">{m.version}</h2>
      <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Runs</dt>
          <dd className="text-xl font-semibold tabular-nums">{m.runs}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Success</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatPercent(m.successRate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Corrections / run</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatCorrections(m.correctionsPerRun)}</dd>
        </div>
      </dl>
    </section>
  );
}
