import React from "react"

/**
 * A native menu click finishes after the dialog is already open. The rest of
 * that click lands on the full-window backdrop (`outside-press`), and the menu
 * can also move focus out of the document (`focus-out`). Base UI then closes
 * the dialog before it is visible. Ignore only those two dismissals, and only
 * briefly, so Escape and a later backdrop click still close it.
 */
export const MENU_DIALOG_DISMISSAL_GRACE_MS = 500

let menuDismissalGuardUntil = 0

export function armMenuDialogDismissalGuard(now = Date.now(), graceMs = MENU_DIALOG_DISMISSAL_GRACE_MS): void {
  menuDismissalGuardUntil = now + graceMs
}

export function resetMenuDialogDismissalGuard(): void {
  menuDismissalGuardUntil = 0
}

export function isTransientMenuDismissal(
  reason: string | undefined,
  openedAtMs: number,
  nowMs: number,
  graceMs = MENU_DIALOG_DISMISSAL_GRACE_MS,
): boolean {
  const justOpened = openedAtMs > 0 && nowMs >= openedAtMs && nowMs - openedAtMs < graceMs
  if (!justOpened) return false
  if (reason === "focus-out") return true
  return reason === "outside-press" && nowMs < menuDismissalGuardUntil
}

type CancelableOpenChange = {
  reason: string
  cancel: () => void
}

export function useCancelTransientMenuFocusOut<Details extends CancelableOpenChange>(
  open: boolean | undefined,
  onOpenChange: ((next: boolean, details: Details) => void) | undefined,
): (next: boolean, details: Details) => void {
  const openedAtRef = React.useRef(0)
  const wasOpenRef = React.useRef(false)
  if (open && !wasOpenRef.current) {
    openedAtRef.current = Date.now()
  }
  wasOpenRef.current = open === true

  return React.useCallback(
    (next, details) => {
      if (!next && isTransientMenuDismissal(details.reason, openedAtRef.current, Date.now())) {
        details.cancel()
        return
      }
      onOpenChange?.(next, details)
    },
    [onOpenChange],
  )
}
