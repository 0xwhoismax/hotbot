import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import styles from "./button.module.css"

const buttonVariants = cva(
  "inline-flex h-[2.5em] shrink-0 items-center justify-center gap-[0.5em] rounded-[var(--r-control)] px-[1.25em] text-sm font-medium whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1em]",
  {
    variants: {
      variant: {
        default: `bg-primary/90 text-primary-foreground hover:bg-primary ${styles.feel} ${styles.solid}`,
        hotbot: `w-fit ${styles.hotbot}`,
        destructive:
          `bg-destructive text-white [--glow:var(--destructive)] hover:bg-destructive/90 dark:bg-destructive/60 ${styles.feel} ${styles.solid}`,
        outline:
          `bg-transparent shadow-[var(--control-shadow),var(--quiet-ring)] [--quiet-ring:inset_0_0_0_1px_var(--input)] hover:bg-[var(--control-bg-hover)] ${styles.feel} ${styles.quiet}`,
        secondary:
          `bg-[var(--control-bg)] text-secondary-foreground shadow-[var(--control-shadow)] hover:bg-[var(--control-bg-hover)] ${styles.feel} ${styles.quiet}`,
        ghost:
          `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 ${styles.feel} ${styles.ghost}`,
        ember: `bg-[var(--ember)] font-semibold text-[oklch(0.18_0_0)] [--glow:var(--ember)] hover:bg-[color-mix(in_oklab,var(--ember)_90%,white)] ${styles.feel} ${styles.solid}`,
        link: "text-primary underline-offset-4 transition-colors hover:underline focus-visible:underline",
      },
      size: {
        default: "",
        xs: "gap-[0.25em] text-xs [&_svg:not([class*='size-'])]:size-[0.75em]",
        sm: "gap-[0.375em]",
        lg: "text-base",
        icon: `size-[2.5em] p-[0em] ${styles.still}`,
        "icon-xs": `size-[2.5em] p-[0em] [&_svg:not([class*='size-'])]:size-[0.75em] ${styles.still}`,
        "icon-sm": `size-[2.5em] p-[0em] ${styles.still}`,
        "icon-lg": `size-[2.5em] p-[0em] [&_svg:not([class*='size-'])]:size-[1.25em] ${styles.still}`,
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
  tone,
  iconTone,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** A meaning for the key's edge: positive and destructive for money, ember for HOTBOT. Pressed or `data-state="set"` fills it. Outline and secondary buttons only. */
    tone?: "positive" | "destructive" | "ember"
    /** A colour for the icon alone, the key keeping the theme's look: info for the account, positive for a verdict, ember for HOTBOT. */
    iconTone?: "positive" | "ember" | "info"
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-key-tone={tone}
      data-icon-tone={iconTone}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
