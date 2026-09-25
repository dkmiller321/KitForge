"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SetCurrentButton({ kit, semver }: { kit: string; semver: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      data-testid="set-current-button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/kits/${kit}/current`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ semver }),
        });
        setBusy(false);
        router.refresh();
      }}
    >
      Set as current
    </Button>
  );
}
