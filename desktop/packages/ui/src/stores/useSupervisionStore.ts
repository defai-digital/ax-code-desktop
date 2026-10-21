import { create } from "zustand"
import { defineStore } from "@/lib/store-registry"
import { getSafeStorage } from "./utils/safeStorage"
import type { SupervisionRow } from "@/lib/supervision/rows"

const STORAGE_KEY = "oc.supervision.v1"
const RECENT_LIMIT = 20
const LAST_VIEWED_LIMIT = 500
const NAV_HISTORY_LIMIT = 50
const WORKING_SET_LIMIT = 50
const WORKING_SET_SESSION_LIMIT = 200

export type WorkingSet = {
  id: string
  name: string
  sessionIds: string[]
}

export type BoardGroupBy = "project" | "none"

export type SupervisionDensity = "comfortable" | "compact"

type PersistedSupervision = {
  density: SupervisionDensity
  boardGroupBy: BoardGroupBy
  inspectorLabels: boolean
  recentSessionIds: string[]
  lastViewedAt: Record<string, number>
  workingSets: WorkingSet[]
  activeWorkingSetId: string | null
}

export type SupervisionStore = PersistedSupervision & {
  /** Ranked root-session rows, published once per window by useSupervisionRowsPublisher. */
  setDensity: (density: SupervisionDensity) => void
  setBoardGroupBy: (boardGroupBy: BoardGroupBy) => void
  setInspectorLabels: (visible: boolean) => void
  rows: SupervisionRow[]
  setRows: (rows: SupervisionRow[]) => void
  /** Browser-style back/forward history of viewed sessions for this app run. */
  navHistory: string[]
  navIndex: number
  missionControlOpen: boolean
  boardFocusSessionId: string | null
  quickDispatchOpen: boolean
  needsYouPopoverOpen: boolean
  /** The multi-run group shown in the compare view, or null. */
  compareRunGroupKey: string | null
  setCompareRunGroupKey: (key: string | null) => void
  setMissionControlOpen: (open: boolean) => void
  toggleMissionControl: () => void
  setQuickDispatchOpen: (open: boolean) => void
  setNeedsYouPopoverOpen: (open: boolean) => void
  /** Record that the user opened a session: moves it to the front of the return stack. */
  recordSessionVisit: (sessionId: string) => void
  /** Record when the user last looked at a session, for the "since you left" strip. */
  markSessionViewed: (sessionId: string, at?: number) => void
  /** Forget when the session was last viewed, so it reads as updated again (like "mark as unread"). */
  markSessionUnread: (sessionId: string) => void
  /** Push a viewed session onto the back/forward history; a no-op when it is the current entry. */
  pushNavHistory: (sessionId: string) => void
  /**
   * Move back (-1) or forward (+1) through the history, skipping sessions that are no longer available.
   * Returns the session to open, or null when there is none in that direction.
   */
  stepNavHistory: (delta: -1 | 1, isAvailable: (sessionId: string) => boolean) => string | null
  createWorkingSet: (name: string, sessionIds?: string[]) => string
  renameWorkingSet: (id: string, name: string) => void
  deleteWorkingSet: (id: string) => void
  addToWorkingSet: (id: string, sessionId: string) => void
  removeFromWorkingSet: (id: string, sessionId: string) => void
  setActiveWorkingSet: (id: string | null) => void
}

const EMPTY: PersistedSupervision = {
  density: "comfortable",
  boardGroupBy: "project",
  inspectorLabels: false,
  recentSessionIds: [],
  lastViewedAt: {},
  workingSets: [],
  activeWorkingSetId: null,
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

export const readPersistedSupervision = (storage: Storage): PersistedSupervision => {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<PersistedSupervision> | null
    if (!parsed || typeof parsed !== "object") return EMPTY
    const lastViewedAt: Record<string, number> = {}
    if (parsed.lastViewedAt && typeof parsed.lastViewedAt === "object") {
      for (const [id, at] of Object.entries(parsed.lastViewedAt)) {
        if (typeof at === "number" && Number.isFinite(at)) lastViewedAt[id] = at
      }
    }
    const workingSets = Array.isArray(parsed.workingSets)
      ? parsed.workingSets.filter(
          (set): set is WorkingSet =>
            Boolean(set) && typeof set.id === "string" && typeof set.name === "string" && isStringArray(set.sessionIds),
        )
      : []
    const activeWorkingSetId =
      typeof parsed.activeWorkingSetId === "string" && workingSets.some((set) => set.id === parsed.activeWorkingSetId)
        ? parsed.activeWorkingSetId
        : null
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
      boardGroupBy: parsed.boardGroupBy === "none" ? "none" : "project",
      inspectorLabels: parsed.inspectorLabels === true,
      recentSessionIds: isStringArray(parsed.recentSessionIds) ? parsed.recentSessionIds.slice(0, RECENT_LIMIT) : [],
      lastViewedAt,
      workingSets,
      activeWorkingSetId,
    }
  } catch {
    return EMPTY
  }
}

const persist = (storage: Storage, state: PersistedSupervision): void => {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        density: state.density,
        boardGroupBy: state.boardGroupBy,
        inspectorLabels: state.inspectorLabels,
        recentSessionIds: state.recentSessionIds,
        lastViewedAt: state.lastViewedAt,
        workingSets: state.workingSets,
        activeWorkingSetId: state.activeWorkingSetId,
      }),
    )
  } catch {
    // Storage is a convenience; the in-memory state stays authoritative.
  }
}

/** Keep the newest entries so the map cannot grow without bound. */
export const pruneLastViewed = (map: Record<string, number>, limit = LAST_VIEWED_LIMIT): Record<string, number> => {
  const entries = Object.entries(map)
  if (entries.length <= limit) return map
  return Object.fromEntries(entries.sort((left, right) => right[1] - left[1]).slice(0, limit))
}

const newWorkingSetId = (): string => `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const safeStorage = getSafeStorage()

export const useSupervisionStore = defineStore(
  "useSupervisionStore",
  { domain: "supervision", tier: "app" },
  create<SupervisionStore>((set, get) => {
    const update = (patch: Partial<PersistedSupervision>) => {
      set(patch)
      const {
        density,
        boardGroupBy,
        inspectorLabels,
        recentSessionIds,
        lastViewedAt,
        workingSets,
        activeWorkingSetId,
      } = get()
      persist(safeStorage, {
        density,
        boardGroupBy,
        inspectorLabels,
        recentSessionIds,
        lastViewedAt,
        workingSets,
        activeWorkingSetId,
      })
    }
    return {
      ...readPersistedSupervision(safeStorage),
      setDensity: (density) => update({ density }),
      setBoardGroupBy: (boardGroupBy) => update({ boardGroupBy }),
      setInspectorLabels: (inspectorLabels) => update({ inspectorLabels }),
      rows: [],
      setRows: (rows) => set({ rows }),
      navHistory: [],
      navIndex: -1,
      missionControlOpen: false,
      boardFocusSessionId: null,
      quickDispatchOpen: false,
      needsYouPopoverOpen: false,
      compareRunGroupKey: null,
      setCompareRunGroupKey: (key) => set({ compareRunGroupKey: key }),
      setMissionControlOpen: (open) => set({ missionControlOpen: open }),
      toggleMissionControl: () => set({ missionControlOpen: !get().missionControlOpen }),
      setQuickDispatchOpen: (open) => set({ quickDispatchOpen: open }),
      setNeedsYouPopoverOpen: (open) => set({ needsYouPopoverOpen: open }),
      recordSessionVisit: (sessionId) => {
        if (!sessionId) return
        const current = get().recentSessionIds
        if (current[0] === sessionId) return
        update({
          recentSessionIds: [sessionId, ...current.filter((id) => id !== sessionId)].slice(0, RECENT_LIMIT),
        })
      },
      markSessionViewed: (sessionId, at = Date.now()) => {
        if (!sessionId) return
        update({ lastViewedAt: pruneLastViewed({ ...get().lastViewedAt, [sessionId]: at }) })
      },
      markSessionUnread: (sessionId) => {
        const current = get().lastViewedAt
        if (!sessionId || !(sessionId in current)) return
        const lastViewedAt = { ...current }
        delete lastViewedAt[sessionId]
        update({ lastViewedAt })
      },
      pushNavHistory: (sessionId) => {
        if (!sessionId) return
        const { navHistory, navIndex } = get()
        if (navHistory[navIndex] === sessionId) return
        const next = [...navHistory.slice(0, navIndex + 1), sessionId].slice(-NAV_HISTORY_LIMIT)
        set({ navHistory: next, navIndex: next.length - 1 })
      },
      stepNavHistory: (delta, isAvailable) => {
        const { navHistory, navIndex } = get()
        for (let index = navIndex + delta; index >= 0 && index < navHistory.length; index += delta) {
          const candidate = navHistory[index]
          if (candidate !== navHistory[navIndex] && isAvailable(candidate)) {
            set({ navIndex: index })
            return candidate
          }
        }
        return null
      },
      createWorkingSet: (name, sessionIds = []) => {
        const id = newWorkingSetId()
        const trimmed = name.trim() || id
        const sessions = [...new Set(sessionIds)].slice(0, WORKING_SET_SESSION_LIMIT)
        // Oldest sets give way once the cap is reached, so storage stays bounded.
        const kept = get().workingSets.slice(-(WORKING_SET_LIMIT - 1))
        const nextWorkingSets = [...kept, { id, name: trimmed, sessionIds: sessions }]
        // Only reachable when the evicted set was the active one, which `deleteWorkingSet` already handles: the
        // stored id kept pointing at a set that no longer exists, so the panel filtered by it and showed nothing
        // and no tab was selected.
        const activeWorkingSetId = get().activeWorkingSetId
        const activeStillExists =
          activeWorkingSetId === null || nextWorkingSets.some((ws) => ws.id === activeWorkingSetId)
        update({
          workingSets: nextWorkingSets,
          ...(activeStillExists ? {} : { activeWorkingSetId: null }),
        })
        return id
      },
      renameWorkingSet: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        update({ workingSets: get().workingSets.map((ws) => (ws.id === id ? { ...ws, name: trimmed } : ws)) })
      },
      deleteWorkingSet: (id) => {
        const state = get()
        update({
          workingSets: state.workingSets.filter((ws) => ws.id !== id),
          activeWorkingSetId: state.activeWorkingSetId === id ? null : state.activeWorkingSetId,
        })
      },
      addToWorkingSet: (id, sessionId) => {
        update({
          workingSets: get().workingSets.map((ws) =>
            ws.id === id && !ws.sessionIds.includes(sessionId)
              ? { ...ws, sessionIds: [...ws.sessionIds, sessionId].slice(-WORKING_SET_SESSION_LIMIT) }
              : ws,
          ),
        })
      },
      removeFromWorkingSet: (id, sessionId) => {
        update({
          workingSets: get().workingSets.map((ws) =>
            ws.id === id ? { ...ws, sessionIds: ws.sessionIds.filter((item) => item !== sessionId) } : ws,
          ),
        })
      },
      setActiveWorkingSet: (id) => {
        const valid = id === null || get().workingSets.some((ws) => ws.id === id)
        if (valid) update({ activeWorkingSetId: id })
      },
    }
  }),
)
