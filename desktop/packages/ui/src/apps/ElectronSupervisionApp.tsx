import React from "react"
import { ErrorBoundary } from "@/components/ui/ErrorBoundary"
import { RuntimeAPIProvider } from "@/contexts/RuntimeAPIProvider"
import { registerRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { MissionControl } from "@/components/supervision/MissionControl"
import { axCodeClient } from "@/lib/ax-code/client"
import type { RuntimeAPIs } from "@/lib/api/types"
import { isDesktopShell } from "@/lib/desktop"
import { useDesktopWindowFullscreen } from "@/hooks/useDesktopWindowFullscreen"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { SyncProvider, useChildStoreManager } from "@/sync/sync-context"
import { SyncRuntimeEffects } from "./AppEffects"
import { useAppFontEffects } from "./useAppFontEffects"

/**
 * Feeds the pop-out the same runtime projections the main window's board reads: the global session index
 * and one directory sync store per directory with an active session. It adds no state of its own.
 */
const SupervisionPopoutBootstrap: React.FC = () => {
  const initializeApp = useConfigStore((state) => state.initializeApp)
  const activeSessions = useGlobalSessionsStore((state) => state.activeSessions)
  const childStores = useChildStoreManager()

  React.useEffect(() => {
    void initializeApp()
    void useGlobalSessionsStore.getState().loadSessions()
  }, [initializeApp])

  const directories = React.useMemo(() => {
    const set = new Set<string>()
    for (const session of activeSessions) {
      const directory = resolveGlobalSessionDirectory(session)
      if (directory) set.add(directory)
    }
    return Array.from(set)
  }, [activeSessions])

  React.useEffect(() => {
    for (const directory of directories) childStores.ensureChild(directory)
  }, [childStores, directories])

  return null
}

/**
 * The window has a hidden native title bar on macOS: give it a drag strip that clears the traffic lights.
 * Other platforms keep their native frame and need none.
 */
const SupervisionPopoutTitleBar: React.FC = () => {
  const macosMajor = typeof window !== "undefined" ? (window.__AX_CODE_DESKTOP_MACOS_MAJOR__ ?? 0) : 0
  const isMacDesktopWindow =
    (Number.isFinite(macosMajor) && macosMajor > 0) ||
    (isDesktopShell() && typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent || ""))
  const isFullscreen = useDesktopWindowFullscreen(isMacDesktopWindow)
  if (!isMacDesktopWindow || isFullscreen) return null
  return (
    <div
      aria-hidden="true"
      className={macosMajor > 0 && macosMajor <= 15 ? "h-14 min-h-[56px] shrink-0" : "h-11 min-h-[44px] shrink-0"}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    />
  )
}

type ElectronSupervisionAppProps = {
  apis: RuntimeAPIs
}

export function ElectronSupervisionApp({ apis }: ElectronSupervisionAppProps) {
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)

  React.useEffect(() => {
    axCodeClient.setDirectory(currentDirectory || undefined)
  }, [currentDirectory])

  React.useEffect(() => {
    registerRuntimeAPIs(apis)
    return () => registerRuntimeAPIs(null)
  }, [apis])

  useAppFontEffects()

  return (
    <ErrorBoundary>
      <SyncProvider sdk={axCodeClient.getSdkClient()} directory={currentDirectory || ""}>
        <RuntimeAPIProvider apis={apis}>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
              <SupervisionPopoutBootstrap />
              <SupervisionPopoutTitleBar />
              {/* A view only: queued sends, notifications, retention and the tray stay with the main window. */}
              <SyncRuntimeEffects embeddedBackgroundWorkEnabled={false} globalHousekeepingEnabled={false} />
              <MissionControl variant="popout" />
              <Toaster />
            </div>
          </TooltipProvider>
        </RuntimeAPIProvider>
      </SyncProvider>
    </ErrorBoundary>
  )
}
