"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-[0.5em] data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex flex-wrap w-fit max-w-full items-center justify-center rounded-[calc(1.5em*var(--r-scale))] p-[0.2em] text-muted-foreground group-data-[orientation=horizontal]/tabs:min-h-[2.5em] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "gap-[0.35em] bg-transparent p-0",
        line: "w-full flex-nowrap justify-start gap-0 overflow-hidden bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const list = React.useRef<HTMLDivElement>(null)
  // The line variant draws one underline that slides to the active trigger, so it follows the trigger's box (and its font size, which sets the underline's inset).
  React.useLayoutEffect(() => {
    const node = list.current
    if (!node || variant !== "line") return
    const place = () => {
      const active = node.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]')
      if (!active) { node.removeAttribute("data-indicator"); return }
      const em = parseFloat(getComputedStyle(active).fontSize), inset = em * 0.5
      // The trigger's own underline box (0.125em tall, its bottom edge 0.2em under the trigger), kept inside the list so its overflow never clips it.
      const height = em * 0.125
      node.style.setProperty("--tab-y", `${Math.min(active.offsetTop + active.offsetHeight + em * 0.075, node.clientHeight - height)}px`)
      node.style.setProperty("--tab-h", `${height}px`)
      node.style.setProperty("--tab-x", `${active.offsetLeft + inset}px`)
      node.style.setProperty("--tab-w", `${Math.max(0, active.offsetWidth - inset * 2)}px`)
      node.setAttribute("data-indicator", node.hasAttribute("data-indicator") ? "slide" : "set")
    }
    place()
    // The first placement happens without a transition; every later one (the observers below fire at once, before paint, with the same values) slides.
    const resize = new ResizeObserver(place)
    resize.observe(node)
    node.querySelectorAll('[data-slot="tabs-trigger"]').forEach(trigger => resize.observe(trigger))
    const mutation = new MutationObserver(place)
    mutation.observe(node, { attributes: true, attributeFilter: ["data-state"], subtree: true })
    return () => { resize.disconnect(); mutation.disconnect() }
  }, [variant])
  return (
    <TabsPrimitive.List
      ref={list}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), variant === "line" && "relative", className)}
      {...props}
    >
      {children}
      {variant === "line" && <span data-slot="tabs-indicator" aria-hidden className="pointer-events-none absolute left-0 top-0 [height:var(--tab-h,2px)] rounded-full bg-theme-accent opacity-0 [transform:translate(var(--tab-x,0px),var(--tab-y,0px))] [width:var(--tab-w,0px)] group-data-[indicator]/tabs-list:opacity-100 group-data-[indicator=slide]/tabs-list:transition-[transform,width] group-data-[indicator=slide]/tabs-list:duration-[var(--dur)] group-data-[indicator=slide]/tabs-list:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" />}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[2.5em] flex-1 items-center justify-center gap-[0.375em] rounded-[var(--r-control)] border border-transparent px-[1.25em] py-[0.5em] text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[0.15em] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1em]",
        "group-data-[variant=line]/tabs-list:flex-1 group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:px-[0.5em] group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:border-theme-accent/60 data-[state=active]:bg-theme-accent/12 data-[state=active]:text-foreground dark:data-[state=active]:border-theme-accent/60 dark:data-[state=active]:bg-theme-accent/12 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-theme-accent after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-[0.5em] group-data-[orientation=horizontal]/tabs:after:bottom-[-0.2em] group-data-[orientation=horizontal]/tabs:after:h-[0.125em] group-data-[orientation=horizontal]/tabs:after:rounded-full group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-[0.125em] group-data-[variant=line]/tabs-list:after:hidden",
        className
      )}
      {...props}
    />
  )
}

function TabsCount({ className, attention = false, ...props }: React.ComponentProps<"span"> & { attention?: boolean }) {
  return (
    <span
      data-slot="tabs-count"
      data-attention={attention || undefined}
      className={cn("text-[0.85em] font-normal tabular-nums text-muted-foreground in-data-[state=active]:text-foreground/70 data-[attention]:font-semibold data-[attention]:text-foreground", className)}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const content = React.useRef<HTMLDivElement>(null)
  // A panel that becomes active slides in from the side of the tab it came from, in step with the tab line (TabsList). The first panel just appears.
  React.useEffect(() => {
    const node = content.current, root = node?.closest<HTMLElement>('[data-slot="tabs"]')
    if (!node || !root) return
    const arrive = () => {
      if (node.dataset.state !== "active") return
      const triggers = Array.from(root.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"]'))
      const index = triggers.findIndex(trigger => trigger.getAttribute("aria-controls") === node.id)
      const before = root.dataset.tab === undefined ? null : Number(root.dataset.tab)
      root.dataset.tab = String(index)
      if (before === null || before === index || index < 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      node.animate(
        [{ opacity: 0, transform: `translateX(${index > before ? 1.25 : -1.25}rem)` }, { opacity: 1, transform: "none" }],
        { duration: 250, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      )
    }
    arrive()
    const watch = new MutationObserver(arrive)
    watch.observe(node, { attributes: true, attributeFilter: ["data-state"] })
    return () => watch.disconnect()
  }, [])
  return (
    <TabsPrimitive.Content
      ref={content}
      data-slot="tabs-content"
      className={cn("min-h-0 min-w-0 flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsCount, TabsContent, tabsListVariants }
