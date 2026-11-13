import { useEffect } from "react"

/** Transitions stay off this long after the last width change. */
const QUIET_MS = 150

/** Marks `<html data-resizing>` while the window width changes, and globals.css turns every transition off under it. Layout that follows the
 *  viewport (the 24vw sidebar, the em scale that steps at 48rem, the tab underline) then moves with the window instead of easing behind it.
 *  Height-only resizes (a phone's address bar or keyboard) leave transitions on. */
export function useResizeQuiet() {
  useEffect(() => {
    const root = document.documentElement
    let width = window.innerWidth, timer = 0
    const onResize = () => {
      if (window.innerWidth === width) return
      width = window.innerWidth
      root.setAttribute("data-resizing", "")
      window.clearTimeout(timer)
      timer = window.setTimeout(() => root.removeAttribute("data-resizing"), QUIET_MS)
    }
    window.addEventListener("resize", onResize, { passive: true })
    return () => {
      window.removeEventListener("resize", onResize)
      window.clearTimeout(timer)
      root.removeAttribute("data-resizing")
    }
  }, [])
}
