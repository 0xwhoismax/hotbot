import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import styles from "./button.module.css"

const buttonVariants = cva(
  "inline-flex h-[2.5em] shrink-0 items-center justify-center gap-[0.5em] rounded-[var(--r-control)] px-[1.25em] text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[0.15em] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1em]",
  {
    variants: {
      variant: {
        default: `bg-primary/90 text-primary-foreground hover:bg-primary ${styles.default}`,
        hotbot: `w-fit ${styles.hotbot}`,
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-transparent hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary/65 text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        xs: "gap-[0.25em] text-xs [&_svg:not([class*='size-'])]:size-[0.75em]",
        sm: "gap-[0.375em]",
        lg: "text-base",
        icon: "size-[2.5em] p-[0em]",
        "icon-xs": "size-[2.5em] p-[0em] [&_svg:not([class*='size-'])]:size-[0.75em]",
        "icon-sm": "size-[2.5em] p-[0em]",
        "icon-lg": "size-[2.5em] p-[0em] [&_svg:not([class*='size-'])]:size-[1.25em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
