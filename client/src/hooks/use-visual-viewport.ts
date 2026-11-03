import { useEffect } from "react"

/** Writes the part of the page on screen (the visual viewport: the screen less an on-screen keyboard) to `--vv-top` and `--vv-h` on `<html>`.
 *  A phone's keyboard leaves fixed layers in place while it scrolls the page up under the status bar, so dialogs centre in this area instead. */
export function useVisualViewport() {
  useEffect(() => {
    const view = window.visualViewport
    if (!view) return
    const root = document.documentElement.style
    let frame = 0
    const write = () => {
      frame = 0
      root.setProperty("--vv-top", `${view.offsetTop}px`)
      root.setProperty("--vv-h", `${view.height}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(write) }
    write()
    view.addEventListener("resize", schedule)
    view.addEventListener("scroll", schedule)
    return () => {
      cancelAnimationFrame(frame)
      view.removeEventListener("resize", schedule)
      view.removeEventListener("scroll", schedule)
      root.removeProperty("--vv-top")
      root.removeProperty("--vv-h")
    }
  }, [])
}
