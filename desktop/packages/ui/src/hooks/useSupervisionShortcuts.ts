import React from "react"

import { useSupervisionRows } from "@/hooks/useSupervisionRows"
import { eventMatchesShortcut, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import {
  readShortcutGuardInput,
  supervisionShortcutAllowed,
  type SupervisionShortcutKind,
} from "@/lib/supervision/shortcutGuard"
import { nextNeedsHumanSession } from "@/lib/supervision/sessionState"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

/**
 * Every supervision shortcut is handled here and only flips supervision state or opens a session, so the
 * surfaces that react to that state never register key handlers of their own.
 */
export function useSupervisionShortcuts(): void {
  const rows = useSupervisionRows()
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides)

  React.useEffect(() => {
    const combo = (id: string) => getEffectiveShortcutCombo(id, shortcutOverrides)
    const openById = (sessionId: string | null) => {
      if (!sessionId) return
      const row = rowsRef.current.find((item) => item.sessionId === sessionId)
      openSupervisedSession({ sessionId, projectId: row?.projectId ?? null, directory: row?.directory ?? null })
    }
    const stepHistory = (delta: -1 | 1) => {
      const known = new Set(rowsRef.current.map((row) => row.sessionId))
      openById(useSupervisionStore.getState().stepNavHistory(delta, (id) => known.has(id)))
    }
    const actions: Array<{ id: string; kind: SupervisionShortcutKind; run: () => void }> = [
      {
        id: "open_mission_control",
        kind: "open-surface",
        run: () => useSupervisionStore.getState().toggleMissionControl(),
      },
      {
        id: "open_quick_dispatch",
        kind: "open-surface",
        run: () => useSupervisionStore.getState().setQuickDispatchOpen(true),
      },
      {
        id: "open_command_palette_alt",
        kind: "open-surface",
        run: () => {
          const ui = useUIStore.getState()
          ui.setCommandPaletteSearchMode(false)
          ui.toggleCommandPalette()
        },
      },
      {
        id: "next_needs_you",
        kind: "navigate",
        run: () => openById(nextNeedsHumanSession(rowsRef.current, useSessionUIStore.getState().currentSessionId)),
      },
      { id: "session_back", kind: "navigate", run: () => stepHistory(-1) },
      { id: "session_forward", kind: "navigate", run: () => stepHistory(1) },
    ]
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const action = actions.find((candidate) => eventMatchesShortcut(event, combo(candidate.id)))
      if (!action || !supervisionShortcutAllowed(action.kind, readShortcutGuardInput(event))) return
      event.preventDefault()
      event.stopPropagation()
      action.run()
    }
    // Capture phase, so the return-stack keys reach us before views that bind mod+alt+arrows themselves.
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [shortcutOverrides])
}

/**
 * Records which session the user is looking at: the back/forward history and the most-recent list on
 * arrival, and the time they left on departure, which the "since you left" strip compares against.
 */
export function useSessionVisitTracking(): void {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const previousRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const supervision = useSupervisionStore.getState()
    const previous = previousRef.current
    if (previous && previous !== currentSessionId) supervision.markSessionViewed(previous)
    if (currentSessionId) {
      supervision.pushNavHistory(currentSessionId)
      supervision.recordSessionVisit(currentSessionId)
    }
    previousRef.current = currentSessionId
  }, [currentSessionId])

  React.useEffect(() => {
    const markCurrent = () => {
      const current = previousRef.current
      if (current && document.visibilityState === "hidden") useSupervisionStore.getState().markSessionViewed(current)
    }
    document.addEventListener("visibilitychange", markCurrent)
    return () => document.removeEventListener("visibilitychange", markCurrent)
  }, [])
}
