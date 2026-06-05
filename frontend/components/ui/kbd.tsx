import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "chip inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
