"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { InsightsDto } from "@/lib/insights/service";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-muted text-muted-foreground",
} as const;

export function InsightsTab({ kit, insights, openFeedback }: { kit: string; insights: InsightsDto | null; openFeedback: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/kits/${kit}/insights`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === "no_feedback" ? "No feedback to analyze yet." : "Couldn't analyze feedback. Nothing was changed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="text-sm">
          {insights ? (
            <p>
              <span className="font-medium">{insights.themes.length} themes</span> from {insights.feedbackCount} feedback items, analyzed on{" "}
              <span className="font-mono">{insights.version}</span> at {new Date(insights.createdAt).toLocaleString()}.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Not analyzed yet. Analyze reads all {openFeedback} open feedback items from every run and ranks the problems worth fixing.
            </p>
          )}
          {insights?.stale && (
            <p data-testid="insights-stale" className="mt-1 text-amber-700">
              {insights.newFeedbackCount > 0
                ? `${insights.newFeedbackCount} new feedback item${insights.newFeedbackCount === 1 ? "" : "s"} since this analysis.`
                : "The kit has a newer version than this analysis."}{" "}
              Analyze again to include {insights.newFeedbackCount > 0 ? "them" : "it"}.
            </p>
          )}
        </div>
        <Button data-testid="analyze-button" onClick={analyze} disabled={loading}>
          {loading ? "Analyzing…" : insights ? "Analyze again" : "Analyze feedback"}
        </Button>
      </div>
      {loading && (
        <p data-testid="insights-loading" role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-3 animate-spin rounded-full border-2 border-forge border-t-transparent" />
          Reading every feedback item…
        </p>
      )}
      {error && (
        <p data-testid="insights-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {insights && insights.themes.length === 0 && <p className="text-sm text-muted-foreground">No problems worth changing the kit for.</p>}
      <ol className="space-y-3">
        {insights?.themes.map((t, i) => (
          <li key={i} data-testid="insight-theme" className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="insight-priority" className={cn("rounded px-1.5 py-0.5 text-xs font-medium", PRIORITY_STYLE[t.priority])}>
                {t.priority}
              </span>
              <h3 data-testid="insight-title" className="font-medium">
                {t.title}
              </h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.problem}</p>
            <p data-testid="insight-suggestion" className="mt-2 text-sm">
              <span className="font-medium">Suggested change:</span> {t.suggestion}
            </p>
            <p data-testid="insight-evidence" className="mt-2 text-xs text-muted-foreground">
              {t.feedback_ids.length} feedback item{t.feedback_ids.length === 1 ? "" : "s"}:{" "}
              {t.feedback_ids.map((id) => (
                <Link
                  key={id}
                  href={`/inbox?kit=${kit}#feedback-${id}`}
                  data-testid="insight-feedback-link"
                  data-feedback-id={id}
                  className="mr-1 font-mono text-forge hover:underline"
                >
                  #{id}
                </Link>
              ))}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
