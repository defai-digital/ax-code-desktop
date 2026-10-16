import React from "react"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useUIStore } from "@/stores/useUIStore"
import { parseRoute, updateBrowserURL, hasRouteParams, withRouteDefaults } from "@/lib/router"
import type { RouteState, AppRouteState } from "@/lib/router"
import type { MainTab } from "@/stores/useUIStore"
import { resolveSettingsSlug } from "@/lib/settings/metadata"

/**
 * Hook that provides bidirectional URL routing for OpenChamber.
 *
 * On mount:
 * - Parses URL parameters and applies them to app state
 * - Sets up subscriptions to sync state changes back to URL
 * - Listens for browser back/forward navigation
 *
 * Works in:
 * - Web: Full bidirectional sync
 * - Desktop (Tauri): Full bidirectional sync
 */
export function useRouter(): void {
  // Track initialization to avoid duplicate applies
  const initializedRef = React.useRef(false)
  const isApplyingRouteRef = React.useRef(false)
  const pendingRouteRef = React.useRef<RouteState | null>(null)

  // Get store actions (stable references)
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession)
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab)
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen)
  const setSettingsPage = useUIStore((state) => state.setSettingsPage)
  const navigateToDiff = useUIStore((state) => state.navigateToDiff)

  /**
   * Get current app state for URL serialization.
   */
  const getCurrentAppState = React.useCallback((): AppRouteState => {
    const sessionState = useSessionUIStore.getState()
    const uiState = useUIStore.getState()

    return {
      sessionId: sessionState.currentSessionId,
      tab: uiState.activeMainTab,
      isSettingsOpen: uiState.isSettingsDialogOpen,
      settingsPath: uiState.settingsPage,
      diffFile: uiState.pendingDiffFile,
    }
  }, [])

  /**
   * Sync current app state to URL.
   */
  const syncURLFromState = React.useCallback(
    (options: { replace?: boolean } = {}) => {
      if (isApplyingRouteRef.current) {
        return
      }

      const state = getCurrentAppState()
      updateBrowserURL(state, options)
    },
    [getCurrentAppState],
  )

  /**
   * Apply a parsed route state to the application stores.
   */
  const applyRoute = React.useCallback(
    async (route: RouteState) => {
      // Keep the newest navigation while a session selection is in flight.
      pendingRouteRef.current = route
      if (isApplyingRouteRef.current) return
      isApplyingRouteRef.current = true

      try {
        while (pendingRouteRef.current) {
          const nextRoute = pendingRouteRef.current
          pendingRouteRef.current = null
          if (nextRoute.sessionId && nextRoute.sessionId !== useSessionUIStore.getState().currentSessionId) {
            await setCurrentSession(nextRoute.sessionId)
          }
          // A newer history entry supersedes the old route's tab/settings.
          if (pendingRouteRef.current) continue

          if (nextRoute.settingsPath) {
            setSettingsPage(resolveSettingsSlug(nextRoute.settingsPath))
            setSettingsDialogOpen(true)
            continue
          }
          if (useUIStore.getState().isSettingsDialogOpen) setSettingsDialogOpen(false)
          if (nextRoute.tab) setActiveMainTab(nextRoute.tab)
          if (nextRoute.diffFile && (nextRoute.tab === "diff" || !nextRoute.tab)) {
            navigateToDiff(nextRoute.diffFile)
          }
        }
      } finally {
        isApplyingRouteRef.current = false
        // Store changes made while this route was being applied updated the
        // subscription baselines below but skipped their URL write; without
        // this re-sync the address bar would keep pointing at the applied
        // route while the app shows something else. No-op when they match.
        syncURLFromState({ replace: true })
      }
    },
    [setCurrentSession, setActiveMainTab, setSettingsDialogOpen, setSettingsPage, navigateToDiff, syncURLFromState],
  )

  // Initialize: parse URL and apply route on mount
  React.useEffect(() => {
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true

    // Only process if URL has route params
    if (!hasRouteParams()) {
      // No route params - just set up sync (URL will update when user navigates)
      return
    }

    // A route read from the address bar omits whatever matches the app's default, so the fields it
    // leaves out have to be filled in here rather than left as "keep the current value".
    const route = withRouteDefaults(parseRoute())

    // Apply the initial route. applyRoute re-syncs the URL to the normalized
    // form in its finally block once applying finishes.
    void applyRoute(route)
  }, [applyRoute])

  // Subscribe to session changes
  React.useEffect(() => {
    let prevSessionId: string | null = useSessionUIStore.getState().currentSessionId

    const unsubscribe = useSessionUIStore.subscribe((state) => {
      const sessionId = state.currentSessionId
      const previous = prevSessionId

      // Keep the baseline current even while a route is being applied. Leaving it
      // stale makes a later change back to that value look like no change, so the
      // URL stops tracking the session after a back/forward navigation.
      prevSessionId = sessionId

      // Skip if no change or if we're currently applying a route
      if (sessionId === previous || isApplyingRouteRef.current) {
        return
      }

      syncURLFromState()
    })

    return unsubscribe
  }, [syncURLFromState])

  // Subscribe to UI store changes (tab, settings)
  React.useEffect(() => {
    let prevTab: MainTab = useUIStore.getState().activeMainTab
    let prevSettingsOpen: boolean = useUIStore.getState().isSettingsDialogOpen
    let prevSettingsPath: string = useUIStore.getState().settingsPage
    let prevDiffFile: string | null = useUIStore.getState().pendingDiffFile

    const unsubscribe = useUIStore.subscribe((state) => {
      const tabChanged = state.activeMainTab !== prevTab
      const settingsOpenChanged = state.isSettingsDialogOpen !== prevSettingsOpen
      const settingsPathChanged = state.settingsPage !== prevSettingsPath
      const diffFileChanged = state.pendingDiffFile !== prevDiffFile && state.activeMainTab === "diff"

      // Update tracking vars
      prevTab = state.activeMainTab
      prevSettingsOpen = state.isSettingsDialogOpen
      prevSettingsPath = state.settingsPage
      prevDiffFile = state.pendingDiffFile

      // Skip if we're currently applying a route (the baseline is already current).
      if (isApplyingRouteRef.current) {
        return
      }

      // Only sync if something relevant changed
      if (tabChanged || settingsOpenChanged || settingsPathChanged || diffFileChanged) {
        syncURLFromState()
      }
    })

    return unsubscribe
  }, [syncURLFromState])

  // Listen for browser back/forward navigation
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handlePopState = () => {
      // Parameter-free history entries also participate in the queue, so an
      // older pending settings route cannot reopen the overlay afterward.
      const route = hasRouteParams()
        ? withRouteDefaults(parseRoute())
        : { sessionId: null, tab: "chat" as const, settingsPath: null, diffFile: null }
      void applyRoute(route)
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [applyRoute])
}
