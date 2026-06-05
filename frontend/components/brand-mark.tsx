"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number;
  withWordmark?: boolean;
};

export function BrandMark({ className, size = 28, withWordmark = false }: Props) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="relative flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent ring-1 ring-primary/20"
        style={{ width: size + 8, height: size + 8 }}
      >
        <Image
          src="/logo.png"
          alt="RedAnalytica"
          width={size}
          height={size}
          priority
          className="drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)]"
        />
      </div>
      {withWordmark && (
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            RedAnalytica
          </div>
          <div className="font-semibold tracking-tightish">RedNotebook AI</div>
        </div>
      )}
    </div>
  );
}
