import React from "react"
import type { MenuDialogRequest } from "./menuDialogRequest"

export const MENU_DIALOG_DISMISSAL_GRACE_MS = 500
export const MenuDialogTimingContext = React.createContext<{ open: boolean; request?: MenuDialogRequest }>({
  open: false,
})
const committedAt = new WeakMap<MenuDialogRequest, number>()

export function deferMenuDialogOpen(open: () => void): number {
  return window.setTimeout(open, 0)
}

// Mount this inside the visible popup, including portals and lazy-loaded
// dialogs. A reconnect/rerender of the same request must not extend its window.
export function useMenuDialogCommit(): void {
  const { open, request } = React.useContext(MenuDialogTimingContext)
  React.useLayoutEffect(() => {
    if (open && request && !committedAt.has(request)) committedAt.set(request, Date.now())
  }, [open, request])
}

export function isTransientMenuDismissal(
  reason: string | undefined,
  openedAtMs: number,
  nowMs: number,
  fromMenu: boolean,
  graceMs = MENU_DIALOG_DISMISSAL_GRACE_MS,
): boolean {
  return (
    fromMenu &&
    openedAtMs > 0 &&
    nowMs >= openedAtMs &&
    nowMs - openedAtMs < graceMs &&
    (reason === "focus-out" || reason === "outside-press")
  )
}

type CancelableOpenChange = { reason: string; cancel: () => void }

export function useCancelTransientMenuFocusOut<Details extends CancelableOpenChange>(
  open: boolean | undefined,
  onOpenChange: ((next: boolean, details: Details) => void) | undefined,
  request?: MenuDialogRequest,
): (next: boolean, details: Details) => void {
  return React.useCallback(
    (next, details) => {
      // Protect the initial native event before a lazy popup mounts, then anchor
      // the full visible grace period at its first commit. There is no global guard.
      const start = request ? (committedAt.get(request) ?? request.requestedAt) : 0
      if (!next && open && isTransientMenuDismissal(details.reason, start, Date.now(), request?.fromMenu === true)) {
        details.cancel()
        return
      }
      onOpenChange?.(next, details)
    },
    [open, onOpenChange, request],
  )
}
