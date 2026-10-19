import React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { ScrollableOverlay } from "./ScrollableOverlay"
import { Icon } from "@/components/icon/Icon"

interface MobileOverlayPanelProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  contentMaxHeightClassName?: string
  renderHeader?: (closeButton: React.ReactNode) => React.ReactNode
}

const OVERLAY_ROOT_ID = "mobile-overlay-root"
const OVERLAY_STACK: symbol[] = []

const isTopmostOverlay = (id: symbol) => OVERLAY_STACK[OVERLAY_STACK.length - 1] === id

const ensureOverlayRoot = () => {
  if (typeof document === "undefined") return null
  let root = document.getElementById(OVERLAY_ROOT_ID)
  if (!root) {
    root = document.createElement("div")
    root.id = OVERLAY_ROOT_ID
    document.body.appendChild(root)
  }
  return root
}

export const MobileOverlayPanel: React.FC<MobileOverlayPanelProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  contentMaxHeightClassName,
  renderHeader,
}) => {
  const overlayRootRef = React.useRef<HTMLElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const overlayIdRef = React.useRef(Symbol("mobile-overlay-panel"))

  if (typeof document !== "undefined" && !overlayRootRef.current) {
    overlayRootRef.current = ensureOverlayRoot()
  }

  React.useEffect(() => {
    if (!open) {
      return
    }
    const overlayId = overlayIdRef.current
    OVERLAY_STACK.push(overlayId)
    return () => {
      const index = OVERLAY_STACK.lastIndexOf(overlayId)
      if (index >= 0) OVERLAY_STACK.splice(index, 1)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }
      // Escape also dismisses CJK IME candidates; the composing keydown must
      // not close the panel.
      if (event.isComposing || event.keyCode === 229) {
        return
      }
      // Only the topmost panel closes; a panel opened from inside another
      // would otherwise close both.
      if (!isTopmostOverlay(overlayIdRef.current)) {
        return
      }
      // Let an open nested popup consume Escape before the panel does.
      const target = event.target
      const owningLayer =
        target instanceof Element
          ? target.closest('[role="dialog"], [role="listbox"], [role="menu"]')
          : null
      if (owningLayer && owningLayer !== panelRef.current) {
        return
      }
      onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open || !overlayRootRef.current) {
    return null
  }

  const contentMaxHeight = contentMaxHeightClassName ?? "max-h-[min(70vh,520px)]"

  const content = (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex flex-col bg-background/70"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn(
          "mt-auto flex max-h-[calc(100dvh-0.75rem)] min-h-0 w-full flex-col rounded-t-xl border border-border/50 bg-background shadow-none surface-overlay-panel",
          "mx-auto max-w-lg",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {(() => {
          const closeButton = (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-interactive-hover"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          )

          if (renderHeader) {
            return renderHeader(closeButton)
          }

          return (
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
              <h2 className="typography-ui-label font-semibold text-foreground">{title}</h2>
              {closeButton}
            </div>
          )
        })()}
        <ScrollableOverlay
          outerClassName={cn("min-h-0 flex-1", contentMaxHeight)}
          className="px-2 py-2 surface-overlay-scroll"
        >
          {children}
        </ScrollableOverlay>
        {footer ? (
          <div className="shrink-0 border-t border-border/40 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )

  return createPortal(content, overlayRootRef.current)
}
