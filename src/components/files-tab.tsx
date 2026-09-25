"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  versions: string[];
  selectedVersion: string;
  files: { path: string; content: string }[];
  rendered: Record<string, React.ReactNode>;
}

/** File tree + viewer for one version. Rendered Markdown for every file comes from the server as `rendered`. */
export function FilesTab({ versions, selectedVersion, files, rendered }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const initial = files.find((f) => f.path === "SKILL.md")?.path ?? files[0]?.path;
  const [selected, setSelected] = useState(initial);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Version</span>
        <select
          data-testid="version-select"
          className="rounded-md border border-input bg-background px-2 py-1 font-mono text-sm"
          value={selectedVersion}
          onChange={(e) => router.push(`${pathname}?tab=files&version=${e.target.value}`)}
        >
          {versions.map((v) => (
            <option key={v} value={v} data-version={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <ul className="space-y-0.5 text-sm">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                data-testid="file-tree-item"
                data-path={f.path}
                aria-current={f.path === selected}
                onClick={() => setSelected(f.path)}
                className={cn(
                  "w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs",
                  f.path === selected ? "bg-forge-soft font-semibold" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f.path}
              </button>
            </li>
          ))}
        </ul>
        <article data-testid="file-viewer" className="min-w-0 rounded-xl border border-border bg-card p-6">
          {selected && rendered[selected]}
        </article>
      </div>
    </div>
  );
}
