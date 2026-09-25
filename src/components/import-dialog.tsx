"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setFile(null);
      setFolder("");
      setError(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (file) form.set("file", file);
    else form.set("path", folder);
    const res = await fetch("/api/kits/import", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "Import failed.");
      return;
    }
    reset(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button data-testid="import-button">Import kit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a kit</DialogTitle>
          <DialogDescription>A zip or folder containing SKILL.md becomes version 1.0.0.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Zip file</span>
            <Input
              data-testid="import-file"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">…or a folder on this machine</span>
            <Input
              data-testid="import-path"
              placeholder="/Users/you/.claude/skills/debug-kit"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              disabled={!!file}
            />
          </label>
          {error && (
            <p data-testid="import-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button data-testid="import-submit" type="submit" disabled={busy || (!file && !folder.trim())}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
