"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// First-run onboarding tour
//
// A hand-rolled spotlight overlay — no third-party dep. Renders a dimmed
// backdrop with a cutout around the target element + a small popover with
// the step's copy. Steps point at elements via `data-tour-anchor=<id>`
// attributes the rest of the app sprinkles in (the SQL cell, the Run
// button, the Files panel, etc.).
//
// Triggers on the first time a user opens the app (localStorage flag).
// Resumable from the topbar "?" button.
// ---------------------------------------------------------------------------

const TOUR_DONE_KEY = "rednotebook:onboarding:v1:done";

type Step = {
  anchor?: string;
  title: string;
  body: string;
  /** Where the popover sits relative to the anchor. Defaults to "bottom". */
  placement?: "bottom" | "top" | "left" | "right";
};

const STEPS: Step[] = [
  {
    title: "Welcome to RedNotebook AI",
    body:
      "A SQL notebook with AI built in. The tour takes 30 seconds — feel free to skip with Esc.",
  },
  {
    anchor: "sql-cell",
    placement: "top",
    title: "Write SQL here",
    body:
      "Type a query, hit ⌘↵ to run. Highlight part of the cell to run only that selection. Click the wand to format, click Optimize for an AI rewrite.",
  },
  {
    anchor: "summarize-button",
    placement: "top",
    title: "Summarize result with AI",
    body:
      "Once a query has run, this button asks the configured AI provider for a deep numeric brief — headline, top numbers, anomalies, follow-up questions.",
  },
  {
    anchor: "files-section",
    placement: "right",
    title: "Drop CSVs anywhere",
    body:
      "Drag a CSV, Parquet, or JSON file onto the app and DuckDB turns it into a queryable table. `SELECT * FROM <filename>` works immediately.",
  },
  {
    anchor: "knowledge-button",
    placement: "left",
    title: "Knowledge layer",
    body:
      "Pull SQL, schemas, and results into a notebook of sources. Ask grounded questions with [n] citation chips. Click here to open the panel.",
  },
  {
    anchor: "publish-button",
    placement: "left",
    title: "Share a notebook",
    body:
      "One click → a public HTML page with live result tables and interactive charts. No account required to view.",
  },
  {
    anchor: "history-button",
    placement: "left",
    title: "Every save is a checkpoint",
    body:
      "Autosave commits your work to a per-user git repo. Open this dialog to browse a timeline of changes and restore any past version.",
  },
  {
    title: "That's it",
    body:
      "Hit the ? icon in the topbar any time to replay this tour. Happy querying.",
  },
];

/**
 * Mounted once near the app root. Renders only when:
 *   * The user has never completed the tour AND we're past initial auth.
 *   * Or the user re-triggers it via the topbar help button.
 *
 * The external trigger uses a window CustomEvent so any component can
 * fire it without prop-drilling.
 */
export function OnboardingTour() {
  const [active, setActive] = React.useState(false);
  const [stepIdx, setStepIdx] = React.useState(0);

  // First-run trigger. Delayed so the app has time to mount the anchors
  // before the spotlight tries to find them.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(TOUR_DONE_KEY);
    if (done === "1") return;
    const t = setTimeout(() => setActive(true), 800);
    return () => clearTimeout(t);
  }, []);

  // Restart trigger fired by the "?" topbar button via:
  //   window.dispatchEvent(new Event("rednotebook:onboarding:start"))
  React.useEffect(() => {
    const onStart = () => {
      setStepIdx(0);
      setActive(true);
    };
    window.addEventListener("rednotebook:onboarding:start", onStart);
    return () =>
      window.removeEventListener("rednotebook:onboarding:start", onStart);
  }, []);

  // Esc dismisses the tour.
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx]);

  function dismiss() {
    setActive(false);
    try {
      window.localStorage.setItem(TOUR_DONE_KEY, "1");
    } catch {
      /* localStorage blocked — harmless, tour just runs again */
    }
  }

  function next() {
    if (stepIdx >= STEPS.length - 1) {
      dismiss();
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  function prev() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  if (!active) return null;
  const step = STEPS[stepIdx];

  return (
    <TourOverlay
      step={step}
      stepIdx={stepIdx}
      total={STEPS.length}
      onNext={next}
      onPrev={prev}
      onDismiss={dismiss}
    />
  );
}

function TourOverlay({
  step,
  stepIdx,
  total,
  onNext,
  onPrev,
  onDismiss,
}: {
  step: Step;
  stepIdx: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}) {
  // Recompute on every render so window resize / sidebar toggle moves the
  // spotlight with the anchor. Cheap — querySelector is microseconds.
  const target = step.anchor
    ? document.querySelector<HTMLElement>(`[data-tour-anchor="${step.anchor}"]`)
    : null;
  const rect = target?.getBoundingClientRect() ?? null;
  // Bump observable: re-render once per animation frame while a step is
  // active, so resize + sidebar transitions track without a debouncer.
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    if (!target) return;
    let raf = 0;
    const tick = () => {
      force();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const padding = 8;
  const cutout = rect
    ? {
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null;

  const popover = computePopoverPosition(rect, step.placement ?? "bottom");

  return (
    <AnimatePresence>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="pointer-events-auto fixed inset-0 z-[100]"
        aria-modal="true"
        role="dialog"
        aria-label={`Onboarding step ${stepIdx + 1} of ${total}: ${step.title}`}
      >
        {/* Dimmed backdrop with a hole around the target via box-shadow trick */}
        {cutout ? (
          <div
            className="pointer-events-auto absolute rounded-xl ring-4 ring-primary/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.62)]"
            style={cutout}
            onClick={onNext}
          />
        ) : (
          <div
            className="pointer-events-auto absolute inset-0 bg-black/62"
            onClick={onNext}
          />
        )}

        {/* Popover */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto absolute max-w-sm rounded-2xl border bg-card p-4 shadow-2xl ring-1 ring-white/5"
          style={popover.style}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span>
              Step {stepIdx + 1} / {total}
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Skip tour"
              className="rounded-md p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 className="text-[15px] font-semibold leading-snug tracking-tightish">
            {step.title}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {step.body}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
            <div className="flex items-center gap-1.5">
              {stepIdx > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrev}
                  className="h-7 text-xs"
                >
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={onNext}
                className="h-7 gap-1 text-xs"
              >
                {stepIdx === total - 1 ? "Done" : "Next"}
                {stepIdx === total - 1 ? null : (
                  <ArrowRight className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Compute where to place the popover. Falls back to centred if the target
 * is null OR off-screen.
 */
function computePopoverPosition(
  rect: DOMRect | null,
  placement: "top" | "bottom" | "left" | "right",
): { style: React.CSSProperties } {
  const W = 320; // approximate popover width
  const H = 160; // approximate popover height
  const gap = 16;
  if (!rect) {
    return {
      style: {
        top: `calc(50% - ${H / 2}px)`,
        left: `calc(50% - ${W / 2}px)`,
      },
    };
  }
  const viewW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewH = typeof window !== "undefined" ? window.innerHeight : 800;
  let top = 0;
  let left = 0;
  switch (placement) {
    case "top":
      top = rect.top - H - gap;
      left = rect.left + rect.width / 2 - W / 2;
      break;
    case "bottom":
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - W / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - H / 2;
      left = rect.left - W - gap;
      break;
    case "right":
      top = rect.top + rect.height / 2 - H / 2;
      left = rect.right + gap;
      break;
  }
  // Clamp to viewport.
  left = Math.max(12, Math.min(viewW - W - 12, left));
  top = Math.max(12, Math.min(viewH - H - 12, top));
  return { style: { top, left } };
}

/**
 * Topbar button that re-launches the tour. Pure UI — fires the same
 * CustomEvent the OnboardingTour listens for.
 */
export function ReplayTourButton() {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          window.localStorage.removeItem(TOUR_DONE_KEY);
        } catch {
          /* harmless */
        }
        window.dispatchEvent(new Event("rednotebook:onboarding:start"));
      }}
      aria-label="Replay tour"
      title="Replay tour"
      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
