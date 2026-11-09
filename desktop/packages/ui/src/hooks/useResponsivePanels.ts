import React from "react"
import { useUIStore } from "@/stores/useUIStore"

type PanelKey = "isSidebarOpen" | "isRightSidebarOpen" | "isBottomTerminalOpen"
interface ResponsivePanel {
  key: PanelKey
  axis: "width" | "height"
  closeBelow: number
  openAt: number
  setOpen: (open: boolean) => void
}
interface ResponsivePanelsOptions {
  isMobile: boolean
  isTablet: boolean
}

/** Responsive defaults yield to a newer explicit panel action, including during a pending resize. */
export function useResponsivePanels({ isMobile, isTablet }: ResponsivePanelsOptions): void {
  React.useEffect(() => {
    // Touch keyboard resizes must not change drawer/terminal visibility.
    if (typeof window === "undefined" || isMobile || isTablet) return
    const state = useUIStore.getState()
    const panels: ResponsivePanel[] = [
      { key: "isSidebarOpen", axis: "width", closeBelow: 900, openAt: 980, setOpen: state.setSidebarOpen },
      { key: "isRightSidebarOpen", axis: "width", closeBelow: 1140, openAt: 1220, setOpen: state.setRightSidebarOpen },
      {
        key: "isBottomTerminalOpen",
        axis: "height",
        closeBelow: 640,
        openAt: 700,
        setOpen: state.setBottomTerminalOpen,
      },
    ]
    const versions: Record<PanelKey, number> = { isSidebarOpen: 0, isRightSidebarOpen: 0, isBottomTerminalOpen: 0 }
    const autoClosed: Record<PanelKey, boolean> = {
      isSidebarOpen: false,
      isRightSidebarOpen: false,
      isBottomTerminalOpen: false,
    }
    let applying = false
    let lastViewport = { width: Number.NaN, height: Number.NaN }
    let timeoutId: number | undefined
    const unsubscribe = useUIStore.subscribe((next, previous) => {
      for (const { key } of panels) {
        if (next[key] === previous[key]) continue
        versions[key] += 1
        if (!applying) autoClosed[key] = false
      }
    })
    const reconcile = (expectedVersions: Record<PanelKey, number>) => {
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      for (const panel of panels) {
        const { key, axis } = panel
        // Duplicate notifications and height-only changes must not undo an explicitly reopened sidebar.
        if (viewport[axis] === lastViewport[axis] || versions[key] !== expectedVersions[key]) continue
        const open = useUIStore.getState()[key]
        const shouldClose = viewport[axis] < panel.closeBelow && open
        const shouldRestore = viewport[axis] >= panel.openAt && autoClosed[key]
        if (!shouldClose && !shouldRestore) continue
        applying = true
        try {
          panel.setOpen(!shouldClose)
          autoClosed[key] = shouldClose
        } finally {
          applying = false
        }
      }
      lastViewport = viewport
    }
    const handleResize = () => {
      window.clearTimeout(timeoutId)
      const expectedVersions = { ...versions }
      timeoutId = window.setTimeout(() => reconcile(expectedVersions), 100)
    }
    reconcile({ ...versions })
    window.addEventListener("resize", handleResize)
    return () => {
      unsubscribe()
      window.removeEventListener("resize", handleResize)
      window.clearTimeout(timeoutId)
    }
  }, [isMobile, isTablet])
}
