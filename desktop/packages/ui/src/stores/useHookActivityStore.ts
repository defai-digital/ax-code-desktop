/**
 * Observational mirror of runtime hook runs (`hook.completed` bus events).
 *
 * Hook runs are frequent and never part of the session/message state, so they
 * bypass the sync reducer entirely: sync-context-impl's onEvent feeds this
 * store through a side channel (like the scheduled-task fan-out). Two views
 * are kept, neither persisted:
 *
 * - a per-session ring buffer of the last {@link HOOK_RUN_LIMIT} runs, for the
 *   in-chat blocked/ask rows and the Mission Control peek;
 * - per-directory blocked/failed counters since the counter was last cleared,
 *   for the "since you left" strip chip.
 */

import { create } from "zustand"
import type { HookCompleted } from "@defai-digital/ax-code-sdk/v2/client"
import { defineStore } from "@/lib/store-registry"

export const HOOK_RUN_LIMIT = 50
/** Sessions whose runs are kept; the least recently active ones are dropped past this. */
export const HOOK_SESSION_LIMIT = 200

export type HookRun = HookCompleted & {
  /** Local receipt time (Date.now()), for relative-time display. */
  receivedAt: number
  /** Stable per-run id for list keys and dismissal; assigned on ingest. */
  id: string
}

export type HookDirectoryCounters = {
  blocked: number
  failed: number
}

export const EMPTY_HOOK_RUNS: readonly HookRun[] = []
export const EMPTY_HOOK_COUNTERS: HookDirectoryCounters = Object.freeze({ blocked: 0, failed: 0 })

type HookActivityStore = {
  runsBySession: Record<string, HookRun[]>
  countersByDirectory: Record<string, HookDirectoryCounters>
  ingestHookCompleted: (properties: HookCompleted, directory: string, receivedAt?: number) => void
  clearDirectoryCounters: (directory: string) => void
}

let nextRunId = 0

const HOOK_OUTCOMES = new Set(["ok", "failed", "blocked", "ask", "rewritten"])

/**
 * Match the directory spellings the strip and the event pipeline use, so a
 * counter written from an event is found by the strip's session directory.
 * Mirrors normalizeEventDirectory in sync/event-routing (stores must not
 * import the sync layer).
 */
export const normalizeHookDirectory = (rawDirectory: string): string => {
  if (!rawDirectory || rawDirectory === "global") return rawDirectory
  const normalized = rawDirectory.replace(/\\/g, "/").replace(/^([a-z]):/, (_, l: string) => l.toUpperCase() + ":")
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized
}

/** Append a run, dropping the oldest entries past the ring-buffer bound. */
export const appendHookRun = (runs: readonly HookRun[], run: HookRun): HookRun[] => {
  const next = [...runs, run]
  return next.length > HOOK_RUN_LIMIT ? next.slice(next.length - HOOK_RUN_LIMIT) : next
}

/**
 * Record a run for a session. The session moves to the end of the insertion order, so when more
 * than {@link HOOK_SESSION_LIMIT} sessions have runs, the least recently active one is dropped
 * and a long-running app does not grow without bound.
 */
export const withSessionRun = (
  runsBySession: Readonly<Record<string, HookRun[]>>,
  sessionId: string,
  run: HookRun,
): Record<string, HookRun[]> => {
  const next: Record<string, HookRun[]> = {}
  for (const [key, runs] of Object.entries(runsBySession)) {
    if (key !== sessionId) next[key] = runs
  }
  next[sessionId] = appendHookRun(runsBySession[sessionId] ?? EMPTY_HOOK_RUNS, run)
  const keys = Object.keys(next)
  for (const key of keys.slice(0, Math.max(0, keys.length - HOOK_SESSION_LIMIT))) delete next[key]
  return next
}

/** The newest runs first, at most `limit` of them. */
export const recentHookRuns = (runs: readonly HookRun[], limit = 5): HookRun[] => runs.slice(-limit).reverse()

export const useHookActivityStore = defineStore(
  "useHookActivityStore",
  { domain: "hooks", tier: "live" },
  create<HookActivityStore>((set) => ({
    runsBySession: {},
    countersByDirectory: {},
    ingestHookCompleted: (properties, directory, receivedAt = Date.now()) => {
      const run: HookRun = { ...properties, receivedAt, id: `hook_${++nextRunId}` }
      const normalizedDirectory = normalizeHookDirectory(directory)
      set((state) => {
        const patch: Partial<HookActivityStore> = {}
        if (properties.sessionID) {
          patch.runsBySession = withSessionRun(state.runsBySession, properties.sessionID, run)
        }
        if (
          normalizedDirectory &&
          normalizedDirectory !== "global" &&
          (properties.outcome === "blocked" || properties.outcome === "failed")
        ) {
          const current = state.countersByDirectory[normalizedDirectory] ?? EMPTY_HOOK_COUNTERS
          patch.countersByDirectory = {
            ...state.countersByDirectory,
            [normalizedDirectory]:
              properties.outcome === "blocked"
                ? { ...current, blocked: current.blocked + 1 }
                : { ...current, failed: current.failed + 1 },
          }
        }
        return Object.keys(patch).length > 0 ? patch : state
      })
    },
    clearDirectoryCounters: (directory) => {
      const normalizedDirectory = normalizeHookDirectory(directory)
      if (!normalizedDirectory || normalizedDirectory === "global") return
      set((state) => {
        if (!(normalizedDirectory in state.countersByDirectory)) return state
        return {
          countersByDirectory: { ...state.countersByDirectory, [normalizedDirectory]: { blocked: 0, failed: 0 } },
        }
      })
    },
  })),
)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectSessionHookRuns = (state: HookActivityStore, sessionId: string): readonly HookRun[] =>
  state.runsBySession[sessionId] ?? EMPTY_HOOK_RUNS

export const selectDirectoryHookCounters = (state: HookActivityStore, directory: string): HookDirectoryCounters =>
  state.countersByDirectory[normalizeHookDirectory(directory)] ?? EMPTY_HOOK_COUNTERS

export function useSessionHookRuns(sessionId: string): readonly HookRun[] {
  return useHookActivityStore((state) => selectSessionHookRuns(state, sessionId))
}

export function useDirectoryHookCounters(directory: string | null | undefined): HookDirectoryCounters {
  return useHookActivityStore((state) =>
    directory ? selectDirectoryHookCounters(state, directory) : EMPTY_HOOK_COUNTERS,
  )
}

// ---------------------------------------------------------------------------
// Side-channel ingest (called from sync-context-impl's onEvent)
// ---------------------------------------------------------------------------

type RuntimeEventPayload = {
  type?: unknown
  properties?: unknown
}

const isHookCompletedProperties = (value: unknown): value is HookCompleted => {
  if (!value || typeof value !== "object") return false
  const props = value as Record<string, unknown>
  return (
    typeof props.event === "string" &&
    props.event.length > 0 &&
    typeof props.command === "string" &&
    (props.source === "project" || props.source === "pack") &&
    typeof props.outcome === "string" &&
    HOOK_OUTCOMES.has(props.outcome) &&
    (props.sessionID === undefined || typeof props.sessionID === "string") &&
    (props.tool === undefined || typeof props.tool === "string") &&
    (props.pack === undefined || typeof props.pack === "string") &&
    (props.reason === undefined || typeof props.reason === "string")
  )
}

/**
 * Feed one raw unified-stream payload into the store. No-op (returns false)
 * for unrelated or malformed payloads, so the caller can forward every event.
 * Runs without a sessionID still count toward their directory; runs for a
 * session this client has not seen yet are kept under that session id — hook
 * activity is observational, so nothing is dropped for being early.
 */
export const ingestHookCompletedEvent = (payload: RuntimeEventPayload, directory: string): boolean => {
  if (!payload || payload.type !== "hook.completed") return false
  if (!isHookCompletedProperties(payload.properties)) return false
  useHookActivityStore.getState().ingestHookCompleted(payload.properties, directory)
  return true
}
