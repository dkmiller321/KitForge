"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DiffLine } from "@/lib/kits/render";
import { cn } from "@/lib/utils";

type Decision = "pending" | "accepted" | "rejected";

interface ReviewHunk {
  id: number;
  filePath: string;
  replace: string;
  rationale: string;
  feedbackIds: number[];
  decision: Decision;
  lines: DiffLine[];
}

interface Props {
  kit: string;
  proposalId: number;
  status: "draft" | "published" | "discarded";
  droppedCount: number;
  hunks: ReviewHunk[];
}

async function patchHunk(id: number, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/hunks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  return res.ok;
}

/** Groups consecutive lines of the same kind so each removed / added block is one element. */
function blocks(lines: DiffLine[]): { kind: DiffLine["kind"]; lines: string[] }[] {
  const out: { kind: DiffLine["kind"]; lines: string[] }[] = [];
  for (const line of lines) {
    const last = out.at(-1);
    if (last && last.kind === line.kind) last.lines.push(line.text);
    else out.push({ kind: line.kind, lines: [line.text] });
  }
  return out;
}

export function ProposalReview({ kit, proposalId, status, droppedCount, hunks }: Props) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<number, Decision>>(Object.fromEntries(hunks.map((h) => [h.id, h.decision])));
  const [bump, setBump] = useState("minor");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const open = status === "draft";

  const values = hunks.map((h) => decisions[h.id]);
  const canPublish = open && values.length > 0 && values.every((d) => d !== "pending") && values.includes("accepted");

  async function decide(id: number, decision: Decision) {
    const previous = decisions[id];
    setDecisions((d) => ({ ...d, [id]: decision }));
    if (!(await patchHunk(id, { decision }))) setDecisions((d) => ({ ...d, [id]: previous }));
  }

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    const res = await fetch(`/api/proposals/${proposalId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bump }),
    });
    if (res.ok) {
      router.push(`/kits/${kit}`);
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setPublishError(body.message ?? "Publishing failed.");
    setPublishing(false);
  }

  async function regenerate() {
    setRegenerating(true);
    setRegenError(null);
    const res = await fetch(`/api/kits/${kit}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: regenInstruction || undefined }),
    });
    if (!res.ok) {
      setRegenerating(false);
      setRegenError("Couldn't generate a proposal. Nothing was changed.");
      return;
    }
    const next = (await res.json()) as { id: number };
    router.push(`/kits/${kit}/proposals/${next.id}`);
  }

  return (
    <div className="space-y-6">
      {!open && (
        <p className="rounded-lg bg-muted px-4 py-2 text-sm">
          This proposal is <strong>{status}</strong> and can no longer be changed.
        </p>
      )}
      {droppedCount > 0 && (
        <p data-testid="proposal-dropped" className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {droppedCount} suggested change{droppedCount === 1 ? "" : "s"} couldn&apos;t be applied and {droppedCount === 1 ? "was" : "were"} dropped
        </p>
      )}
      {hunks.length === 0 && <p className="text-sm text-muted-foreground">No applicable changes were proposed. Try regenerating with an instruction.</p>}

      <ol className="space-y-4">
        {hunks.map((h) => (
          <HunkCard key={h.id} hunk={h} decision={decisions[h.id]} open={open} onDecide={(d) => decide(h.id, d)} onEdited={() => router.refresh()} />
        ))}
      </ol>

      {open && (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Version bump</span>
              <select
                data-testid="bump-select"
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={bump}
                onChange={(e) => setBump(e.target.value)}
              >
                <option value="patch">patch</option>
                <option value="minor">minor</option>
                <option value="major">major</option>
              </select>
            </label>
            <Button data-testid="publish-button" disabled={!canPublish || publishing} onClick={publish}>
              {publishing ? "Publishing…" : "Publish new version"}
            </Button>
            {publishError && (
              <p data-testid="publish-error" role="alert" className="text-sm text-destructive">
                {publishError}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block space-y-1.5 text-sm">
              <span className="text-muted-foreground">Regenerate with an extra instruction</span>
              <input
                data-testid="regenerate-instruction"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                placeholder="e.g. shorter"
                value={regenInstruction}
                onChange={(e) => setRegenInstruction(e.target.value)}
              />
            </label>
            <Button data-testid="regenerate-button" variant="outline" disabled={regenerating} onClick={regenerate}>
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
            {regenError && <p className="text-sm text-destructive">{regenError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function HunkCard({
  hunk,
  decision,
  open,
  onDecide,
  onEdited,
}: {
  hunk: ReviewHunk;
  decision: Decision;
  open: boolean;
  onDecide: (d: Decision) => void;
  onEdited: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hunk.replace);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await patchHunk(hunk.id, { edited_replace: draft });
    setSaving(false);
    if (ok) {
      setEditing(false);
      onEdited();
    }
  }

  return (
    <li
      data-testid="proposal-hunk"
      data-hunk-id={hunk.id}
      data-file={hunk.filePath}
      data-decision={decision}
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        decision === "accepted" ? "border-emerald-400" : decision === "rejected" ? "border-border opacity-70" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2">
        <span className="font-mono text-xs font-semibold">{hunk.filePath}</span>
        <span className="text-xs text-muted-foreground">{decision}</span>
      </div>
      <div className="overflow-x-auto font-mono text-xs leading-5">
        {blocks(hunk.lines).map((b, i) => (
          <div
            key={i}
            data-testid={b.kind === "removed" ? "hunk-removed" : b.kind === "added" ? "hunk-added" : undefined}
            className={cn(b.kind === "removed" && "bg-red-50 text-red-900", b.kind === "added" && "bg-emerald-50 text-emerald-900")}
          >
            {b.lines.map((line, j) => (
              <div key={j} className="px-4 whitespace-pre">
                <span className="mr-3 select-none text-muted-foreground">{b.kind === "removed" ? "-" : b.kind === "added" ? "+" : " "}</span>
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-border px-4 py-3">
        <p className="text-sm">
          <span data-testid="hunk-rationale">{hunk.rationale}</span>{" "}
          {hunk.feedbackIds.map((id) => (
            <Link
              key={id}
              href={`/inbox#feedback-${id}`}
              data-testid="hunk-feedback-link"
              data-feedback-id={id}
              className="ml-1 font-mono text-xs text-forge hover:underline"
            >
              #{id}
            </Link>
          ))}
        </p>
        {editing && (
          <div className="space-y-2">
            <textarea
              data-testid="hunk-edit-input"
              rows={Math.max(2, draft.split("\n").length)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button data-testid="hunk-edit-save" size="sm" disabled={saving} onClick={save}>
                Save text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {open && (
          <div className="flex gap-2">
            <Button data-testid="hunk-accept" size="sm" variant={decision === "accepted" ? "default" : "outline"} onClick={() => onDecide("accepted")}>
              Accept
            </Button>
            <Button data-testid="hunk-reject" size="sm" variant={decision === "rejected" ? "default" : "outline"} onClick={() => onDecide("rejected")}>
              Reject
            </Button>
            {!editing && (
              <Button data-testid="hunk-edit" size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
