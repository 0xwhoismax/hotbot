import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, variant = "default", rows, ...props }: React.ComponentProps<"textarea"> & { variant?: "default" | "composer" }) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      rows={rows ?? (variant === "composer" ? 1 : undefined)}
      className={cn(
        "flex field-sizing-content min-h-[6em] w-full rounded-[var(--r-control)] border border-input bg-transparent px-[1.25em] py-[0.85em] text-base transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[0.15em] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/15 dark:aria-invalid:ring-destructive/40",
        variant === "composer" && "min-h-0 max-h-[10em] resize-none rounded-none border-0 bg-transparent px-[0.5em] py-[0.5em] shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
