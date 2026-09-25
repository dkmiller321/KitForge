import Link from "next/link";
import { notFound } from "next/navigation";
import { Changelog } from "@/components/changelog";
import { FilesTab } from "@/components/files-tab";
import { MarkdownView } from "@/components/markdown-view";
import { RunsTab } from "@/components/runs-tab";
import { SetCurrentButton } from "@/components/set-current-button";
import { acceptedCount, filesForVersion, getKit } from "@/lib/kits/service";
import { listRuns } from "@/lib/runs/service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = ["files", "versions", "runs", "metrics"] as const;
type Tab = (typeof TABS)[number];

export default async function KitPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ tab?: string; version?: string }>;
}) {
  const { name } = await params;
  const query = await searchParams;
  const kit = getKit(name);
  if (!kit) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as Tab) : "files";
  const accepted = acceptedCount(kit.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <h1 data-testid="kit-title" className="font-mono text-2xl font-semibold tracking-tight">
              {kit.name}
            </h1>
            <span className="rounded bg-forge-soft px-1.5 py-0.5 font-mono text-sm">
              v<span data-testid="kit-current-version">{kit.currentVersion}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{kit.title}</p>
          <code data-testid="pull-command" className="inline-block rounded-md bg-muted px-2 py-1 font-mono text-xs">
            kit pull {kit.name}@{kit.currentVersion}
          </code>
        </div>
        <div className="flex items-center gap-3">
          <span data-testid="improve-count" className="text-sm text-muted-foreground">
            {accepted} accepted
          </span>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border text-sm">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/kits/${kit.name}?tab=${t}`}
            data-testid={`tab-${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 capitalize",
              t === tab ? "border-forge font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === "files" && <FilesSection kitName={kit.name} versions={kit.versions} requested={query.version} />}
      {tab === "runs" && <RunsTab runs={listRuns(kit.name)} />}
      {tab === "versions" && (
        <ol className="space-y-3">
          {kit.versions.map((v) => (
            <li
              key={v.id}
              data-testid="version-row"
              data-version={v.semver}
              data-current={v.isCurrent ? "true" : undefined}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold">{v.semver}</span>
                  {v.isCurrent && <span className="rounded bg-forge px-1.5 py-0.5 text-[11px] font-semibold text-white">current</span>}
                  <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                {!v.isCurrent && <SetCurrentButton kit={kit.name} semver={v.semver} />}
              </div>
              <Changelog markdown={v.changelogMd} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FilesSection({
  kitName,
  versions,
  requested,
}: {
  kitName: string;
  versions: { id: number; semver: string; isCurrent: boolean }[];
  requested?: string;
}) {
  const version = versions.find((v) => v.semver === requested) ?? versions.find((v) => v.isCurrent)!;
  const files = filesForVersion(version.id);
  const ordered = [...files.filter((f) => f.path === "SKILL.md"), ...files.filter((f) => f.path !== "SKILL.md")];
  return (
    <FilesTab
      key={`${kitName}@${version.semver}`}
      versions={versions.map((v) => v.semver)}
      selectedVersion={version.semver}
      files={ordered}
      rendered={Object.fromEntries(ordered.map((f) => [f.path, <MarkdownView key={f.path} path={f.path} content={f.content} />]))}
    />
  );
}
