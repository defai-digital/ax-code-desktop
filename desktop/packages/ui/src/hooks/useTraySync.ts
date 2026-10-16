import React from "react"
import { invokeDesktop, isDesktopShell } from "@/lib/desktop"
import { formatQuotaValueLabel, formatWindowLabel, QUOTA_PROVIDERS } from "@/lib/quota"
import { buildTraySnapshot, type TraySnapshot, type TrayUsage } from "@/lib/tray/traySnapshot"
import { useGitStore } from "@/stores/useGitStore"
import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { useQuotaStore } from "@/stores/useQuotaStore"
import { useSyncNotificationStore } from "@/sync/notification-store"
import { getAllSyncSessions, getSyncChildStores } from "@/sync/sync-refs"
import { getPermissionAlwaysPatterns } from "@/lib/permissions/permissionPayload"

/**
 * Streams a compact session/approval snapshot to the Electron tray (macOS menu
 * bar) over the `desktop_tray_update` IPC command. The tray itself is rendered by
 * the main process (`tray.mjs`); this hook only supplies state and keeps the dock
 * badge in step.
 *
 * Tray clicks are already routed back into the app by App.tsx through the
 * `openchamber:tray-action` event, so nothing here has to handle them.
 */

const FLUSH_DEBOUNCE_MS = 500
// Event-driven flushes do the real work; this is a slow safety net for state that
// changes without a store notification (e.g. a branch appearing from git).
const POLL_INTERVAL_MS = 5_000

const buildUsage = (): TrayUsage => {
  const { results, dropdownProviderIds, displayMode } = useQuotaStore.getState()
  const mode: TrayUsage["mode"] = displayMode === "remaining" ? "remaining" : "usage"
  if (!dropdownProviderIds.length) {
    return { mode, groups: [] }
  }

  const byProvider = new Map(results.map((result) => [result?.providerId, result]))
  const groups: TrayUsage["groups"] = []
  for (const provider of QUOTA_PROVIDERS) {
    if (!dropdownProviderIds.includes(provider.id)) continue
    const result = byProvider.get(provider.id)
    if (!result || result.configured !== true) continue

    const rows: TrayUsage["groups"][number]["rows"] = []
    for (const [label, window] of Object.entries(result.usage?.windows ?? {})) {
      const percent = mode === "remaining" ? window.remainingPercent : window.usedPercent
      rows.push({ label: formatWindowLabel(label), value: formatQuotaValueLabel(window.valueLabel, percent) })
    }

    groups.push({
      provider: provider.name,
      rows,
      status: !result.ok && result.error ? result.error : rows.length === 0 ? "No rate limits reported" : null,
    })
  }

  return { mode, groups }
}

const buildBranchMap = (): Map<string, string> => {
  const branches = new Map<string, string>()
  const branchByDirectory = useGlobalSessionsStore.getState().sessionsByDirectory
  const gitDirectories = useGitStore.getState().directories
  for (const directory of branchByDirectory.keys()) {
    // Branch data lives in the per-directory git store, not the session index;
    // the subtitle falls back to the project name alone when nothing is known.
    branches.set(directory, gitDirectories.get(directory)?.branches?.current ?? "")
  }
  return branches
}

const collectApprovals = (sessions: Array<{ id: string; title?: string | null; directory?: string | null }>) => {
  const approvals: Array<{
    kind: "permission" | "question"
    id: string
    sessionId: string
    title?: string | null
    resource?: string | null
    directory?: string | null
    canSave?: boolean
  }> = []

  let stores: ReturnType<typeof getSyncChildStores> | null = null
  try {
    stores = getSyncChildStores()
  } catch {
    return approvals
  }

  const directoryBySession = new Map(sessions.map((session) => [session.id, session.directory ?? ""]))
  for (const store of stores.children.values()) {
    const state = store.getState()
    for (const [sessionId, requests] of Object.entries(state.permission ?? {})) {
      for (const request of requests ?? []) {
        approvals.push({
          kind: "permission",
          id: request.id,
          sessionId,
          // `permission` is the tool/action name; the first pattern is the
          // resource the user is being asked about.
          title: request.permission ?? null,
          resource: request.patterns?.[0] ?? null,
          directory: directoryBySession.get(sessionId) ?? null,
          // Only offer "Allow always" when it would actually remember something.
          canSave: getPermissionAlwaysPatterns(request).length > 0,
        })
      }
    }
    for (const [sessionId, requests] of Object.entries(state.question ?? {})) {
      for (const request of requests ?? []) {
        approvals.push({
          kind: "question",
          id: request.id,
          sessionId,
          title: request.questions?.[0]?.header ?? request.questions?.[0]?.question ?? null,
          directory: directoryBySession.get(sessionId) ?? null,
        })
      }
    }
  }

  return approvals
}

export const buildTraySnapshotFromStores = (): TraySnapshot => {
  const sessions = getAllSyncSessions().map((session) => ({
    id: session.id,
    title: session.title,
    parentID: (session as { parentID?: string | null }).parentID ?? null,
    directory: resolveGlobalSessionDirectory(session),
    updatedAt: session.time?.updated ?? session.time?.created ?? 0,
    archived: session.time?.archived ?? null,
  }))

  // Statuses come from the same per-directory sync stores the sidebar uses.
  const statusBySession: Record<string, string | undefined> = {}
  const unseenCountBySession: Record<string, number | undefined> = {}
  const errorBySession: Record<string, boolean | undefined> = {}
  try {
    const stores = getSyncChildStores()
    for (const store of stores.children.values()) {
      for (const [sessionId, status] of Object.entries(store.getState().session_status ?? {})) {
        statusBySession[sessionId] = status?.type
      }
    }
  } catch {
    // Sync not mounted yet — the snapshot is simply empty until it is.
  }
  const notification = useSyncNotificationStore.getState()
  for (const session of sessions) {
    unseenCountBySession[session.id] = notification.sessionUnseenCount(session.id)
    errorBySession[session.id] = notification.sessionHasError(session.id)
  }

  return buildTraySnapshot({
    sessions,
    statusBySession,
    unseenCountBySession,
    errorBySession,
    approvals: collectApprovals(sessions),
    branchByDirectory: buildBranchMap(),
    usage: buildUsage(),
  })
}

export function useTraySync(enabled = true): void {
  const desktop = React.useMemo(() => isDesktopShell(), [])

  React.useEffect(() => {
    if (!enabled || !desktop) {
      return
    }

    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastBadge = -1

    const flush = () => {
      if (disposed) return
      try {
        const snapshot = buildTraySnapshotFromStores()
        // The invoke can reject — the main-process handler may throw, and the window may be gone —
        // and the try/catch below only covers the synchronous build: an unhandled rejection came
        // back on every store change and on the five-second poll for as long as it kept failing.
        void invokeDesktop("desktop_tray_update", snapshot).catch((error) => {
          console.warn("[tray-sync] failed to update the tray", error)
        })
        // The dock badge is its own command so it keeps working when the menu bar
        // item is disabled by the user.
        if (snapshot.dockBadgeCount !== lastBadge) {
          lastBadge = snapshot.dockBadgeCount
          void invokeDesktop("desktop_set_badge_count", { count: snapshot.dockBadgeCount }).catch((error) => {
            console.warn("[tray-sync] failed to set the dock badge", error)
          })
        }
      } catch (error) {
        console.warn("[tray-sync] failed to build the tray snapshot", error)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        flush()
      }, FLUSH_DEBOUNCE_MS)
    }

    const unsubscribers = [
      useGlobalSessionsStore.subscribe(schedule),
      useSyncNotificationStore.subscribe(schedule),
      useQuotaStore.subscribe(schedule),
      useGitStore.subscribe(schedule),
    ]
    const pollTimer = setInterval(schedule, POLL_INTERVAL_MS)

    flush()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      clearInterval(pollTimer)
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
    }
  }, [desktop, enabled])
}
