"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useIsMobile } from "@/hooks/use-mobile"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme(), mobile = useIsMobile()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={1500}
      position={mobile ? "top-center" : "bottom-right"}
      toastOptions={mobile ? { style: { borderRadius: "999px", padding: "0.7rem 1.1rem" } } : undefined}
      icons={{
        success: <CircleCheckIcon className="size-[1em]" />,
        info: <InfoIcon className="size-[1em]" />,
        warning: <TriangleAlertIcon className="size-[1em]" />,
        error: <OctagonXIcon className="size-[1em]" />,
        loading: <Loader2Icon className="size-[1em] animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
