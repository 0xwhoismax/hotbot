"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

/** One switch for the whole app. `accent` lights the track in HOTBOT's ember for the switch that matters on a screen (running, real money). */
function Switch({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
  variant?: "default" | "accent"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-variant={variant}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-[background-color,box-shadow] duration-250 outline-none focus-visible:ring-[0.2em] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[size=default]:h-[1.5em] data-[size=default]:w-[2.65em] data-[size=default]:p-[0.15em] data-[size=sm]:h-[1.15em] data-[size=sm]:w-[2em] data-[size=sm]:p-[0.1em]",
        "data-[state=unchecked]:bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)] data-[state=unchecked]:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]",
        "data-[state=checked]:data-[variant=default]:bg-foreground data-[state=checked]:data-[variant=accent]:bg-[var(--ember)] data-[state=checked]:data-[variant=accent]:shadow-[0_0_0_0.2em_color-mix(in_oklab,var(--ember)_22%,transparent)]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          "group-data-[size=default]/switch:size-[1.2em] group-data-[size=sm]/switch:size-[0.95em]",
          "data-[state=checked]:translate-x-[calc(100%-0.05em)] data-[state=unchecked]:translate-x-0",
          "group-data-[variant=default]/switch:data-[state=checked]:bg-background group-data-[variant=accent]/switch:data-[state=checked]:bg-white bg-[color-mix(in_oklab,var(--foreground)_85%,transparent)]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
