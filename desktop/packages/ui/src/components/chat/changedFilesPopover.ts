import type { CSSProperties } from "react"

export const changedFilesPopoverClassName =
  "w-max min-w-[280px] max-w-full rounded-xl p-1 shadow-popover origin-[var(--transform-origin)]"

export const changedFilesPopoverStyle: CSSProperties = {
  maxWidth: "calc(100cqw - 4ch)",
  backgroundColor: "var(--surface-elevated)",
  color: "var(--surface-elevated-foreground)",
}
