"use client"

import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

/** One segmented toggle for the whole app: every choice in one small pill, the picked one filled the way `.seg` and `.miniSeg` fill theirs
 *  (shadcn's ToggleGroup on Radix). A single-choice group never lets the picked one be turned off. */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "inline-flex shrink-0 items-center gap-[0.15em] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] p-[0.2em]",
        className
      )}
      {...props}
    />
  )
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-[2em] min-w-[3.6em] cursor-pointer items-center justify-center rounded-[var(--r-pill)] px-[0.85em] text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-[background-color,color] duration-150 outline-none hover:text-foreground focus-visible:ring-[0.15em] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60",
        "data-[state=on]:bg-foreground data-[state=on]:text-background",
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
