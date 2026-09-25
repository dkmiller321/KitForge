"use client";

import { useState } from "react";
import { Diff, Hunk, parseDiff, type DiffType } from "react-diff-view";
import "react-diff-view/style/index.css";
import { Button } from "@/components/ui/button";

interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified";
  patch: string;
}

const DIFF_TYPE: Record<FileDiff["status"], DiffType> = { added: "add", removed: "delete", modified: "modify" };

export function VersionDiff({ kit, versions }: { kit: string; versions: string[] }) {
  const [from, setFrom] = useState(versions[1] ?? versions[0]);
  const [to, setTo] = useState(versions[0]);
  const [files, setFiles] = useState<FileDiff[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function show() {
    setLoading(true);
    const res = await fetch(`/api/kits/${kit}/diff?from=${from}&to=${to}`);
    setLoading(false);
    setFiles(res.ok ? ((await res.json()) as { files: FileDiff[] }).files : []);
  }

  const select = (testId: string, value: string, onChange: (v: string) => void) => (
    <select
      data-testid={testId}
      aria-label={testId === "diff-from" ? "Diff from version" : "Diff to version"}
      className="rounded-md border border-input bg-background px-2 py-1 font-mono text-sm"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        setFiles(null);
      }}
    >
      {versions.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Compare files</span>
        {select("diff-from", from, setFrom)}
        <span className="text-muted-foreground">→</span>
        {select("diff-to", to, setTo)}
        <Button data-testid="diff-show" size="sm" variant="outline" disabled={loading} onClick={show}>
          Show diff
        </Button>
      </div>
      {files && (
        <div data-testid="version-diff" className="space-y-4">
          {files.length === 0 && <p className="text-sm text-muted-foreground">No differences.</p>}
          {files.map((file) => {
            const [parsed] = parseDiff(file.patch);
            return (
              <div key={file.path} className="overflow-hidden rounded-lg border border-border">
                <div className="border-b border-border bg-muted/50 px-3 py-1.5 font-mono text-xs font-semibold">
                  {file.path} <span className="font-normal text-muted-foreground">({file.status})</span>
                </div>
                <div className="overflow-x-auto font-mono text-xs">
                  <Diff viewType="unified" diffType={DIFF_TYPE[file.status]} hunks={parsed?.hunks ?? []}>
                    {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
                  </Diff>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
