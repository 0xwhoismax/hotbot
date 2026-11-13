"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import styles from "./scroll-fade.module.css"

/** One row that scrolls sideways when its content does not fit, with a soft fade on each edge that has more to show. Never wraps, so the layout around it does not shift. */
function ScrollFade({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      el.toggleAttribute("data-fade-start", el.scrollLeft > 1)
      el.toggleAttribute("data-fade-end", el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => { el.removeEventListener("scroll", update); observer.disconnect() }
  }, [children])
  return <div ref={ref} data-slot="scroll-fade" className={cn(styles.fade, className)} {...props}>{children}</div>
}

export { ScrollFade }
