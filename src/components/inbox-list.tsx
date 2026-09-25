"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FeedbackDto } from "@/lib/feedback/service";
import { FEEDBACK_CHANGED } from "./inbox-badge";
import { cn } from "@/lib/utils";

interface Props {
  tab: "new" | "resolved" | "dismissed";
  kit: string;
  kitNames: string[];
  items: FeedbackDto[];
}

async function patch(id: number, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/feedback/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    // Finish the save even if the user navigates away straight after acting.
    keepalive: true,
  });
  return res.ok;
}

export function InboxList({ tab, kit, kitNames, items }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState(-1);
  const [selected, setSelected] = useState<number[]>([]);
  const visible = items.filter((i) => !hidden.has(i.id));
  const focusIndex = visible.length === 0 ? -1 : Math.min(focus, visible.length - 1);

  const setStatus = useCallback(
    async (id: number, status: "dismissed" | "new") => {
      // Remove the item only once the change is saved, so what the list shows is always persisted.
      if (!(await patch(id, { status }))) return;
      setHidden((h) => new Set(h).add(id));
      setSelected((s) => s.filter((x) => x !== id));
      window.dispatchEvent(new Event(FEEDBACK_CHANGED));
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.key === "j") setFocus(Math.min(focusIndex + 1, visible.length - 1));
      else if (e.key === "k") setFocus(Math.max(focusIndex - 1, 0));
      else if (e.key === "d" && tab === "new" && focusIndex >= 0) void setStatus(visible[focusIndex].id, "dismissed");
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIndex, visible, tab, setStatus]);

  async function merge() {
    const ids = [...selected].sort((a, b) => a - b);
    const res = await fetch("/api/feedback/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    if (!res.ok) return;
    setHidden((h) => new Set([...h, ...ids.slice(1)]));
    setSelected([]);
    window.dispatchEvent(new Event(FEEDBACK_CHANGED));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Kit</span>
          <select
            data-testid="inbox-filter-kit"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={kit}
            onChange={(e) => router.push(`${pathname}?tab=${tab}${e.target.value === "all" ? "" : `&kit=${e.target.value}`}`)}
          >
            <option value="all">all</option>
            {kitNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {tab === "new" && (
          <Button data-testid="merge-button" variant="outline" size="sm" disabled={selected.length < 2} onClick={merge}>
            Merge {selected.length >= 2 ? selected.length : ""} duplicates
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p data-testid="inbox-empty" className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          {tab === "new" ? "No open feedback" : tab === "resolved" ? "Nothing resolved yet" : "Nothing dismissed"}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item, i) => (
            <InboxItem
              key={item.id}
              item={item}
              tab={tab}
              focused={i === focusIndex}
              selected={selected.includes(item.id)}
              onSelect={(on) => setSelected((s) => (on ? [...s, item.id] : s.filter((x) => x !== item.id)))}
              onStatus={(status) => setStatus(item.id, status)}
              onTags={async (tags) => {
                const saved = await patch(item.id, { tags });
                if (saved) router.refresh();
                return saved;
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxItem({
  item,
  tab,
  focused,
  selected,
  onSelect,
  onStatus,
  onTags,
}: {
  item: FeedbackDto;
  tab: Props["tab"];
  focused: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onStatus: (status: "dismissed" | "new") => void;
  onTags: (tags: string[]) => Promise<boolean>;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState(item.tags);
  const runs = item.runIds.length;

  return (
    <li
      id={`feedback-${item.id}`}
      data-testid="inbox-item"
      data-feedback-id={item.id}
      data-status={item.status}
      data-focused={focused ? "true" : undefined}
      className={cn(
        "rounded-xl border bg-card p-4 transition",
        focused ? "border-forge ring-2 ring-forge/30" : "border-border",
      )}
    >
      <div className="flex gap-3">
        {tab === "new" && (
          <input
            data-testid="inbox-select"
            type="checkbox"
            aria-label="Select for merge"
            className="mt-1 size-4 accent-[var(--forge)]"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">#{item.id}</span>
            <span data-testid="feedback-kit" className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
              {item.kitName}
            </span>
            <span>{item.kind}</span>
            <span data-testid="feedback-runs">
              {runs} {runs === 1 ? "run" : "runs"}
            </span>
            {item.rating !== null && (
              <span data-testid="feedback-rating" className="font-medium text-foreground">
                {item.rating}/5
              </span>
            )}
            <span data-testid="feedback-status" className="ml-auto">
              {item.status === "resolved" && item.resolvedInVersion ? `Resolved in ${item.resolvedInVersion}` : item.status}
            </span>
          </div>
          <p data-testid="feedback-text" className="font-medium whitespace-pre-line">
            {item.text}
          </p>
          {item.quote && (
            <blockquote data-testid="feedback-quote" className="border-l-2 border-forge/60 pl-3 text-sm text-muted-foreground italic">
              “{item.quote}”
            </blockquote>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <span key={t} data-testid="feedback-tag" className="rounded-full bg-forge-soft px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
            {tab === "new" && (
              <input
                data-testid="feedback-tag-input"
                aria-label="Add tag"
                placeholder="+ tag"
                className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-input focus:border-input focus:outline-none"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const tag = tagDraft.trim().toLowerCase();
                  if (!tag || tags.includes(tag)) return setTagDraft("");
                  const next = [...tags, tag];
                  // Show the chip only once it is saved, so a reload can never lose it.
                  if (await onTags(next)) {
                    setTags(next);
                    setTagDraft("");
                  }
                }}
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {tab === "new" && (
            <Button data-testid="feedback-dismiss" size="sm" variant="ghost" title="Leave this out of future analyses" onClick={() => onStatus("dismissed")}>
              Dismiss
            </Button>
          )}
          {tab === "dismissed" && (
            <Button data-testid="feedback-restore" size="sm" variant="ghost" onClick={() => onStatus("new")}>
              Restore
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
