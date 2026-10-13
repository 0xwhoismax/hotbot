"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

/** One way to open a section in place (a "more" toggle, a details panel). Closed content is unmounted; opening and closing play one short keyframe on Radix's measured height with a fade, no per-frame JS. */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

/** A plain button carrying `aria-expanded` and `data-state`; style it and turn its chevron on `[data-state=open]`. Positioned so it stays above the content's bleed. */
function CollapsibleTrigger({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" className={cn("relative", className)} {...props} />
}

/** The clip carries a 0.25rem bleed (padding, cancelled by a negative margin) so focus rings inside are not cut off. */
function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      className={cn(
        "-m-1 overflow-hidden p-1 data-[state=open]:animate-collapsible-open data-[state=closed]:animate-collapsible-close motion-reduce:animate-none!",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
