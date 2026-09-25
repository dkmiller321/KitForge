import Link from "next/link";
import { ImportDialog } from "@/components/import-dialog";
import { listKits } from "@/lib/kits/service";
import { formatPercent } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const kits = listKits();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">Every kit, every version, and how each one is doing.</p>
        </div>
        <ImportDialog />
      </div>

      {kits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p data-testid="library-empty" className="text-base font-medium">
            No kits yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Import a kit folder or zip with a SKILL.md to get started.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kits.map((kit) => (
            <li key={kit.name}>
              <Link
                href={`/kits/${kit.name}`}
                data-testid="kit-card"
                data-kit-name={kit.name}
                className="block rounded-xl border border-border bg-card p-4 transition hover:border-forge/60 hover:shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{kit.name}</span>
                  <span data-testid="kit-card-version" className="rounded bg-forge-soft px-1.5 py-0.5 font-mono text-xs">
                    v{kit.currentVersion}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{kit.title}</p>
                <div className="mt-4 flex gap-6 text-xs text-muted-foreground">
                  <span data-testid="kit-card-runs">
                    {kit.runCount} {kit.runCount === 1 ? "run" : "runs"}
                  </span>
                  <span>
                    success <span data-testid="kit-card-success" className="font-medium text-foreground">{formatPercent(kit.successRate)}</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
