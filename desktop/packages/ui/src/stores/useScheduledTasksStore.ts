/**
 * Runtime scheduled tasks for every registered project, keyed by normalized
 * project directory (the runtime's `?directory=` instance key). Not persisted:
 * the runtime owns the tasks, this is a display cache for the sidebar's
 * "Scheduled" section and its editor.
 *
 * Each directory has a request sequence. A response is applied only when it
 * is the latest request for a directory that is still tracked, so a slow
 * response cannot overwrite a newer one or resurrect a removed project.
 */

import { create } from "zustand"
import { defineStore } from "@/lib/store-registry"
import { fetchScheduledTasks, type ScheduledTask } from "@/lib/scheduledTasksApi"
import { loadCurrent } from "@/lib/currentLoad"
import { mapWithConcurrencyLimit, normalizeDirectory } from "@/components/session/scheduledTaskGroups"

export type ScheduledTaskGroupState = {
  tasks: ScheduledTask[]
  loading: boolean
  /** Message of the latest failed load; cleared by the next successful one. */
  error: string | null
  hasLoaded: boolean
}

export const EMPTY_SCHEDULED_TASK_GROUP: ScheduledTaskGroupState = {
  tasks: [],
  loading: false,
  error: null,
  hasLoaded: false,
}

export const SCHEDULED_TASK_LOAD_CONCURRENCY = 3

type ScheduledTasksStore = {
  groups: Record<string, ScheduledTaskGroupState>
  /**
   * Replace the tracked directory set. Removed directories are dropped (their
   * in-flight responses are discarded); added ones are returned so the caller
   * can load them.
   */
  setTrackedDirectories: (directories: readonly string[]) => string[]
  loadGroup: (directory: string) => Promise<void>
  loadGroups: (directories: readonly string[]) => Promise<void>
  /**
   * Optimistic local edit of one directory's tasks. Discards any load already
   * in flight for the directory; the next load replaces the edit.
   */
  patchGroupTasks: (directory: string, updater: (tasks: ScheduledTask[]) => ScheduledTask[]) => void
}

// Request ids come from one global counter, so a directory that is removed
// and re-added never reuses an id an older in-flight request still holds.
let nextRequestID = 0
const requestSeqByDirectory = new Map<string, number>()
let trackedDirectories = new Set<string>()

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "Failed to load scheduled tasks"

export const useScheduledTasksStore = defineStore(
  "useScheduledTasksStore",
  { domain: "scheduled-tasks", tier: "app" },
  create<ScheduledTasksStore>()((set) => {
    const updateGroup = (directory: string, updater: (prev: ScheduledTaskGroupState) => ScheduledTaskGroupState) => {
      if (!trackedDirectories.has(directory)) {
        return
      }
      set((state) => ({
        groups: {
          ...state.groups,
          [directory]: updater(state.groups[directory] ?? EMPTY_SCHEDULED_TASK_GROUP),
        },
      }))
    }

    const loadOne = async (directory: string): Promise<void> => {
      nextRequestID += 1
      const seq = nextRequestID
      requestSeqByDirectory.set(directory, seq)
      updateGroup(directory, (prev) => (prev.loading ? prev : { ...prev, loading: true }))
      const isCurrent = () => trackedDirectories.has(directory) && requestSeqByDirectory.get(directory) === seq
      const loaded = await loadCurrent({ load: () => fetchScheduledTasks(directory), isCurrent })
      if (loaded.status === "loaded") {
        updateGroup(directory, () => ({ tasks: loaded.result, loading: false, error: null, hasLoaded: true }))
      } else if (loaded.status === "failed") {
        // Keep the last good list: a transient failure should not blank a project.
        updateGroup(directory, (prev) => ({ ...prev, loading: false, error: errorMessage(loaded.error) }))
      }
      // "stale": a newer request (or the project's removal) owns the state.
    }

    return {
      groups: {},

      setTrackedDirectories: (directories) => {
        const next = new Set(directories.map(normalizeDirectory).filter(Boolean))
        const added = [...next].filter((directory) => !trackedDirectories.has(directory))
        const removed = [...trackedDirectories].filter((directory) => !next.has(directory))
        trackedDirectories = next
        for (const directory of removed) {
          requestSeqByDirectory.delete(directory)
        }
        if (added.length > 0 || removed.length > 0) {
          set((state) => {
            const groups = { ...state.groups }
            for (const directory of removed) {
              delete groups[directory]
            }
            for (const directory of added) {
              // Mark new groups as loading before the concurrency limit queues
              // them, so they render as loading rather than empty.
              groups[directory] = { ...EMPTY_SCHEDULED_TASK_GROUP, loading: true }
            }
            return { groups }
          })
        }
        return added
      },

      loadGroup: async (directory) => {
        const normalized = normalizeDirectory(directory)
        if (!normalized || !trackedDirectories.has(normalized)) {
          return
        }
        await loadOne(normalized)
      },

      loadGroups: async (directories) => {
        const batch = [...new Set(directories.map(normalizeDirectory).filter(Boolean))]
        await mapWithConcurrencyLimit(batch, SCHEDULED_TASK_LOAD_CONCURRENCY, async (directory) => {
          // Skip work for a project removed while this batch waited its turn.
          if (!trackedDirectories.has(directory)) {
            return
          }
          await loadOne(directory)
        })
      },

      patchGroupTasks: (directory, updater) => {
        const normalized = normalizeDirectory(directory)
        if (!trackedDirectories.has(normalized)) {
          return
        }
        // A load already in flight started before this edit and would put the
        // old values back; invalidate it. The caller reloads after mutating.
        nextRequestID += 1
        requestSeqByDirectory.set(normalized, nextRequestID)
        updateGroup(normalized, (prev) => ({ ...prev, loading: false, tasks: updater(prev.tasks) }))
      },
    }
  }),
)

export const getScheduledTaskGroup = (directory: string): ScheduledTaskGroupState =>
  useScheduledTasksStore.getState().groups[normalizeDirectory(directory)] ?? EMPTY_SCHEDULED_TASK_GROUP

/** Test-only: forget tracked directories, sequences and cached groups. */
export const resetScheduledTasksStoreForTests = (): void => {
  requestSeqByDirectory.clear()
  trackedDirectories = new Set()
  useScheduledTasksStore.setState({ groups: {} })
}
