import React from "react"
import { isDesktopShell } from "@/lib/desktop"

// The desktop shell hides the native macOS title bar, so screens that render
// before or instead of the main Header need their own drag region. On macOS the
// strip is as tall as the traffic-light bar (44px; see
// electron/src/desktop-window-chrome.js); elsewhere the native frame stays and
// the strip only covers a web Window Controls Overlay title bar when present.
const isMacDesktopShell = (): boolean =>
  isDesktopShell() && typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent || "")

export const DesktopTitlebarDragStrip: React.FC = () => {
  const [isMacDesktop] = React.useState(isMacDesktopShell)
  return (
    <div
      className="app-region-drag fixed left-0 top-0 z-20"
      style={{
        height: isMacDesktop
          ? "max(44px, var(--ax-wco-titlebar-height, 0px))"
          : "var(--ax-wco-titlebar-height, 0px)",
        right: "var(--ax-wco-right-inset, 0px)",
      }}
      aria-hidden
    />
  )
}
