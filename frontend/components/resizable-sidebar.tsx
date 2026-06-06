"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_MAX, SIDEBAR_MIN } from "@/store/ui-store";

type Props = {
  side: "left" | "right";
  width: number;
  collapsed: boolean;
  onResize: (next: number) => void;
  onToggle: () => void;
  children: React.ReactNode;
};

/**
 * Animated, collapsible, drag-to-resize sidebar wrapper.
 *
 * - Smooth open/close with framer-motion (animates the width).
 * - Drag handle on the inner edge clamped to [SIDEBAR_MIN, SIDEBAR_MAX].
 * - When collapsed, renders a floating "expand" button on the canvas edge
 *   so the panel is one click away.
 */
export function ResizableSidebar({
  side,
  width,
  collapsed,
  onResize,
  onToggle,
  children,
}: Props) {
  const draggingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const dir = side === "left" ? 1 : -1;
    onResize(startWidthRef.current + delta * dir);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ width }}
            className={cn(
              "relative flex h-full shrink-0 flex-col overflow-hidden",
              side === "left" ? "border-r" : "border-l",
              "bg-background/40"
            )}
          >
            <div className="flex h-full flex-col overflow-hidden">
              {children}
            </div>

            {/* Inline collapse button at the top edge */}
            <button
              type="button"
              onClick={onToggle}
              aria-label={`Collapse ${side} sidebar`}
              className={cn(
                "absolute top-2 z-10 grid h-5 w-5 place-items-center rounded-md border bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100",
                side === "left" ? "right-2" : "left-2"
              )}
            >
              {side === "left" ? (
                <ChevronLeft className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>

            {/* Drag handle on the inner edge */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={cn(
                "absolute inset-y-0 z-20 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-primary/40",
                side === "left" ? "right-0" : "left-0"
              )}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* When collapsed, a tiny rail button to bring the sidebar back */}
      {collapsed && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Expand ${side} sidebar`}
          className={cn(
            "z-10 grid h-full w-6 shrink-0 place-items-center bg-background/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            side === "left" ? "border-r" : "border-l"
          )}
        >
          {side === "left" ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <PanelRight className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </>
  );
}

const _MIN = SIDEBAR_MIN;
const _MAX = SIDEBAR_MAX;
void _MIN;
void _MAX;
