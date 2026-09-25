"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** K8: edit the current version's files in the browser; saving creates a new patch version. */
export function EditKit({ kit, version, files }: { kit: string; version: string; files: { path: string; content: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(files[0]?.path ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(files.map((f) => [f.path, f.content])));
  const [changelog, setChangelog] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed = files.filter((f) => drafts[f.path] !== f.content);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/kits/${kit}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: changed.map((f) => ({ path: f.path, content: drafts[f.path] })), changelog, bump: "patch" }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error === "no_changes" ? "Nothing changed." : "Saving failed.");
      return;
    }
    setOpen(false);
    setChangelog("");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDrafts(Object.fromEntries(files.map((f) => [f.path, f.content])));
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="edit-kit-button" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit {kit}</DialogTitle>
          <DialogDescription>Changes to {version} are saved as a new patch version. {version} itself never changes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <select
            data-testid="edit-file-select"
            aria-label="File to edit"
            className="rounded-md border border-input bg-background px-2 py-1 font-mono text-sm"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          >
            {files.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}
                {drafts[f.path] !== f.content ? " •" : ""}
              </option>
            ))}
          </select>
          <textarea
            data-testid="edit-textarea"
            aria-label={`Contents of ${path}`}
            rows={16}
            spellCheck={false}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
            value={drafts[path] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))}
          />
          <input
            data-testid="edit-changelog"
            aria-label="Changelog"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            placeholder="Changelog: what changed and why"
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button data-testid="edit-save" disabled={saving || changed.length === 0} onClick={save}>
              {saving ? "Saving…" : `Save as new version (${changed.length} file${changed.length === 1 ? "" : "s"})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
