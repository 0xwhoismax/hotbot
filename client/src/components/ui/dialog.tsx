"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  layout = "flow",
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  layout?: "flow" | "panel"
}) {
  const opener = React.useRef<HTMLElement | null>(null)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-layout={layout}
        onOpenAutoFocus={(event) => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (!event.defaultPrevented && opener.current?.isConnected) {
            event.preventDefault()
            opener.current.focus()
          }
        }}
        className={cn(
          "fixed top-[calc(var(--view-top)+var(--view-h)/2)] left-[50%] z-50 grid max-h-[calc(var(--view-h)-2em)] overflow-y-auto w-full max-w-[calc(100%-2em)] translate-x-[-50%] translate-y-[-50%] gap-[1em] rounded-[calc(1.5em*var(--r-scale))] bg-[var(--menu-bg)] backdrop-blur-sm [--dialog-pad:1.5em] [--dialog-pad-bottom:var(--dialog-pad)] p-[var(--dialog-pad)] pb-[var(--dialog-pad-bottom)] shadow-[var(--menu-shadow)] duration-250 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          // Phones: a sheet the full width of the screen, standing on its bottom edge (or on the keyboard), with a fill that runs on below it for
          // where iOS draws it too high.
          layout === "flow" && "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-[var(--view-bottom)] max-sm:max-h-[calc(var(--view-h)+var(--view-gap-bottom)-0.75em)] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:[--dialog-pad:1.25em] max-sm:[--dialog-pad-bottom:calc(var(--dialog-pad)+var(--view-gap-bottom))] max-sm:shadow-[var(--sheet-shadow),0_6em_0_0_var(--menu-bg)] max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom",
          layout === "panel" && "flex h-[min(44em,calc(var(--view-h)-2em))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[48em] [&>[data-slot=dialog-header]]:border-b [&>[data-slot=dialog-header]]:p-[1.5em] [&>[data-slot=dialog-header]]:pr-[4em] [&>[data-slot=dialog-footer]]:border-t [&>[data-slot=dialog-footer]]:p-[1em]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-[1em] right-[1em] inline-flex size-[2.5em] items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1em]"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col gap-[0.5em] pr-[2.5em] text-left", className)}
      {...props}
    />
  )
}

/** The part of a padless DialogContent (`p-0`, a flex column) that scrolls, above a footer or dock that stays. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-[var(--dialog-pad)]", className)} {...props} />
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-wrap flex-col-reverse gap-[0.5em] sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
