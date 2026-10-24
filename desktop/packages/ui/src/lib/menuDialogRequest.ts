// A fresh, non-persisted request belongs to one menu-opened dialog instance.
export type MenuDialogRequest = Readonly<{ fromMenu: true; requestedAt: number }>
export type MenuDialogOpenOptions = Readonly<{ fromMenu?: boolean }>

export function createMenuDialogRequest(): MenuDialogRequest {
  return Object.freeze({ fromMenu: true, requestedAt: Date.now() })
}
