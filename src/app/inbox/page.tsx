import Link from "next/link";
import { InboxList } from "@/components/inbox-list";
import { listFeedback } from "@/lib/feedback/service";
import { kitNames } from "@/lib/kits/service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "new", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; kit?: string }> }) {
  const query = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "new";
  const names = kitNames();
  const kit = query.kit && names.includes(query.kit) ? query.kit : undefined;
  // Items accepted under the old triage flow count as open.
  const items = listFeedback({ kit }).filter((f) => (tab === "new" ? f.status === "new" || f.status === "accepted" : f.status === tab));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Everything reported from every run. All open feedback goes into each kit&apos;s analysis; dismiss only noise.{" "}
          <kbd className="kbd">j</kbd>/<kbd className="kbd">k</kbd> to move, <kbd className="kbd">d</kbd> to dismiss.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <nav className="flex gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              data-testid={`inbox-tab-${t.key}`}
              href={`/inbox?tab=${t.key}${kit ? `&kit=${kit}` : ""}`}
              aria-current={t.key === tab ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2",
                t.key === tab ? "border-forge font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <InboxList key={`${tab}:${kit ?? "all"}`} tab={tab} kit={kit ?? "all"} kitNames={names} items={items} />
    </div>
  );
}
