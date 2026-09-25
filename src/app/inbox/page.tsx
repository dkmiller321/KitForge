import Link from "next/link";
import { InboxList } from "@/components/inbox-list";
import { listFeedback } from "@/lib/feedback/service";
import { kitNames } from "@/lib/kits/service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "new", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "resolved", label: "Resolved" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; kit?: string }> }) {
  const query = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === query.tab) ? (query.tab as TabKey) : "new";
  const names = kitNames();
  const kit = query.kit && names.includes(query.kit) ? query.kit : undefined;
  const items = listFeedback({ kit, status: tab });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Feedback from every run. <kbd className="kbd">j</kbd>/<kbd className="kbd">k</kbd> to move, <kbd className="kbd">a</kbd> to
          accept, <kbd className="kbd">d</kbd> to dismiss.
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
