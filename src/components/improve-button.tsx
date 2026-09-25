"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ImproveButton({ kit, themes, stale }: { kit: string; themes: number; stale: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/kits/${kit}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: instruction || undefined }),
    });
    if (!res.ok) {
      setLoading(false);
      setError("Couldn't generate a proposal. Nothing was changed.");
      return;
    }
    const proposal = (await res.json()) as { id: number };
    // Stay in the loading state until the proposal page replaces this one.
    router.push(`/kits/${kit}/proposals/${proposal.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (loading) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          data-testid="improve-button"
          disabled={themes === 0}
          title={themes === 0 ? "Analyze the kit's feedback first (Insights tab)" : undefined}
        >
          Improve
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Improve {kit}</DialogTitle>
          <DialogDescription>
            Claude proposes edits that address the {themes} theme{themes === 1 ? "" : "s"} from the latest analysis. You review every change before
            anything is published.
            {stale && " That analysis is out of date (newer feedback or a newer version); analyze again first to include it."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Extra instruction (optional)</span>
            <textarea
              data-testid="improve-instruction"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. keep it shorter, prefer editing existing rules"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          {loading && (
            <p data-testid="proposal-loading" role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-3 animate-spin rounded-full border-2 border-forge border-t-transparent" />
              Generating a proposal…
            </p>
          )}
          {error && (
            <p data-testid="proposal-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button data-testid="improve-submit" type="submit" disabled={loading}>
              Generate proposal
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
