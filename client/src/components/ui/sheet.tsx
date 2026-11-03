"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-[1em] bg-popover backdrop-blur-2xl shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-250 data-[state=open]:animate-in data-[state=open]:duration-500",
          side === "right" &&
            "inset-y-0 right-[0em] h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-[0em] h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-[0em] h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          // A bottom sheet runs 6em past the screen's bottom edge, padded back by as much, so where iOS draws it too high (a home-screen app) the
          // sheet still reaches the edge.
          side === "bottom" &&
            "inset-x-0 bottom-[-6em] h-auto max-h-[calc(100dvh-env(safe-area-inset-top)+4em)] gap-[0em] overflow-y-auto overscroll-contain rounded-t-[calc(1.5em*var(--r-scale))] bg-[var(--menu-bg)] pb-[calc(env(safe-area-inset-bottom)+6em)] shadow-[var(--menu-shadow)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className
        )}
        {...props}
      >
        {side === "bottom" && <SheetGrabber />}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-[1em] right-[1em] inline-flex size-[2.5em] items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
            <XIcon className="size-[1em]" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/** A bottom sheet's handle. A tap or a drag down past a quarter of the sheet closes it; a shorter drag springs back. */
function SheetGrabber() {
  const from = React.useRef<number | null>(null)
  const pulled = React.useRef(0)
  const sheet = (handle: HTMLElement) => handle.closest<HTMLElement>("[data-slot=sheet-content]")
  const pull = (handle: HTMLElement, by: number) => {
    const node = sheet(handle)
    if (!node) return
    node.style.transition = by ? "none" : ""
    node.style.translate = by ? `0 ${by}px` : ""
  }
  const closes = (handle: HTMLElement) => pulled.current > (sheet(handle)?.offsetHeight ?? 0) / 4
  return (
    <SheetPrimitive.Close
      tabIndex={-1}
      aria-hidden
      className="flex h-[1.75em] w-full shrink-0 cursor-grab touch-none justify-center select-none pt-[0.6em] outline-none active:cursor-grabbing"
      onPointerDown={(event) => {
        from.current = event.clientY
        pulled.current = 0
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (from.current === null) return
        pulled.current = Math.max(0, event.clientY - from.current)
        pull(event.currentTarget, pulled.current)
      }}
      onPointerUp={(event) => {
        from.current = null
        if (closes(event.currentTarget)) event.currentTarget.click()
        else pull(event.currentTarget, 0)
      }}
      onPointerCancel={(event) => {
        from.current = null
        pulled.current = 0
        pull(event.currentTarget, 0)
      }}
      onClick={(event) => {
        if (pulled.current > 4 && !closes(event.currentTarget)) event.preventDefault()
      }}
    >
      <span className="h-[0.3em] w-[2.5em] rounded-full bg-muted-foreground/40" />
    </SheetPrimitive.Close>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-[0.375em] p-[1em]", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-[0.5em] p-[1em]", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
