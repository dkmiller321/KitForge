"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export const FEEDBACK_CHANGED = "kitforge:feedback-changed";

/** Open-feedback badge. Refetches on every route change and whenever the feedback list changes, so it never goes stale. */
export function InboxBadge({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const res = await fetch("/api/feedback/count", { cache: "no-store" });
      if (res.ok && !cancelled) setCount(((await res.json()) as { open: number }).open);
    };
    void refresh();
    window.addEventListener(FEEDBACK_CHANGED, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(FEEDBACK_CHANGED, refresh);
    };
  }, [pathname, search]);

  if (count === 0) return null;
  return (
    <span data-testid="inbox-count" className="rounded-full bg-forge px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white">
      {count}
    </span>
  );
}
