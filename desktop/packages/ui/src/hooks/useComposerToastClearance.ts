import React from "react"

/** CSS variable the toaster reads to keep bottom toasts above the composer. */
export const COMPOSER_TOAST_CLEARANCE_VAR = "--toast-composer-clearance"

// The composer that wrote the variable last; another composer's cleanup must not erase its value.
let owner: object | null = null

/**
 * Publishes how far the composer reaches up from the bottom of the window, so long-running toasts
 * (runtime and CLI updates, downloads) sit above the message box instead of covering it. The value
 * follows the composer as it grows with multi-line drafts and is removed when the composer unmounts.
 */
export function useComposerToastClearance(ref: React.RefObject<HTMLElement | null>, enabled: boolean): void {
  React.useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof window === "undefined") return
    const root = document.documentElement
    const token = {}
    const update = () => {
      owner = token
      const clearance = Math.max(0, Math.round(window.innerHeight - element.getBoundingClientRect().top))
      root.style.setProperty(COMPOSER_TOAST_CLEARANCE_VAR, `${clearance}px`)
    }
    update()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    observer?.observe(element)
    // Layout changes around the composer can move it without resizing it.
    if (element.parentElement) observer?.observe(element.parentElement)
    window.addEventListener("resize", update)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", update)
      if (owner === token) {
        owner = null
        root.style.removeProperty(COMPOSER_TOAST_CLEARANCE_VAR)
      }
    }
  }, [ref, enabled])
}
