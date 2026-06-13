"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, X } from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// "Public demo" banner — only rendered when the backend reports
// demo_mode=true (set via DEMO_MODE=true env on the hosted try.* instance).
//
// Tells visitors plainly that their work isn't persisted between sessions
// AND offers a one-click path to install locally. Dismissable for the
// session via a tiny X — we don't persist the dismissal to localStorage
// because the demo instance wipes regularly anyway, and a fresh visit
// should see the warning again.
// ---------------------------------------------------------------------------

const DISMISS_KEY = "rednotebook:demo-banner:dismissed";

export function DemoBanner() {
  const [dismissed, setDismissed] = React.useState(false);
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
  });
  const demoMode = health.data?.demo_mode === true;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  if (!demoMode || dismissed) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-amber-500/30 bg-amber-500/[0.08] px-4 py-1.5 text-[12px] text-amber-200">
      <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="text-balance">
        You&apos;re on the <strong>public demo</strong> — notebooks and uploads
        may be wiped without notice. To keep your work,{" "}
        <a
          href="https://github.com/sanniheruwala/RedNotebookAI#install"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-amber-400/60 underline-offset-2 hover:text-amber-100"
        >
          install locally
        </a>{" "}
        — one <code className="rounded bg-amber-500/15 px-1 font-mono text-[10.5px]">docker run</code>.
      </span>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* harmless */
          }
        }}
        aria-label="Dismiss demo banner"
        className="ml-2 grid h-5 w-5 shrink-0 place-items-center rounded text-amber-300/70 hover:bg-amber-500/15 hover:text-amber-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
