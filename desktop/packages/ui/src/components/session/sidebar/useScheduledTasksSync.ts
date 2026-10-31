import * as React from "react"
import { useScheduledTasksStore } from "@/stores/useScheduledTasksStore"
import { subscribeScheduledTaskEvents, type ScheduledTaskEvent } from "@/lib/scheduledTaskEvents"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import { getProjectPathIdentityKey } from "@/lib/projectResolution"
import { buildPendingEntries, selectDueReloads, type PendingScheduleGroupInput } from "../scheduledTaskPending"

/** Coalescing window for runtime events about one directory. */
const EVENT_DEBOUNCE_MS = 400
/** Re-render relative times and look for due tasks this often. */
const TICK_MS = 30_000
/** A due task's directory reloads this long after the run time. */
const DUE_GRACE_MS = 10_000
const DUE_MIN_INTERVAL_MS = 60_000
/** Slow fallback refresh for events this window never received. */
const FALLBACK_REFRESH_MS = 5 * 60_000

type LoadedGroups = Readonly<Record<string, { tasks: readonly Pick<ScheduledTask, "id" | "directory">[] }>>

/**
 * Projects to reload for a runtime event: the registered project the event's
 * directory names, otherwise the loaded projects whose tasks carry that
 * directory or the event's task id. Directories are compared by path identity
 * (separators, drive-letter case), since the projects store, the SDK client
 * and the runtime each spell a path their own way. The runtime also reports a
 * task's directory as the resolved real path, so a project registered through
 * a symlink never matches by name; its loaded tasks still name the real path
 * and its ids are unique within the project. Returns "all" for an event with
 * neither a directory nor a task id, and [] when no owner can be found
 * (usually a delete already reflected here, left to the fallback refresh).
 */
export const directoriesForScheduledTaskEvent = (
  event: Pick<ScheduledTaskEvent, "directory" | "taskId">,
  known: readonly string[],
  groups: LoadedGroups,
): string[] | "all" => {
  const identity = getProjectPathIdentityKey(event.directory)
  if (identity) {
    const registered = known.find((directory) => getProjectPathIdentityKey(directory) === identity)
    if (registered !== undefined) return [registered]
  }
  if (!identity && !event.taskId) return "all"
  // Task ids are only guaranteed unique per project, so every loaded project
  // that lists the id is a candidate owner.
  return Object.entries(groups)
    .filter(([, group]) =>
      group.tasks.some(
        (task) =>
          (event.taskId !== undefined && task.id === event.taskId) ||
          (identity !== null && getProjectPathIdentityKey(task.directory) === identity),
      ),
    )
    .map(([owner]) => owner)
}

const isDocumentHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden"

/**
 * Keep the scheduled-tasks store in sync for the given project groups while
 * `enabled`: load registered projects, reload on runtime events, reload a
 * project once its next run is due, and refresh slowly as a fallback. While
 * disabled nothing is tracked or fetched. Returns a clock for relative labels
 * that advances every tick while the window is visible.
 */
export function useScheduledTasksSync(groups: readonly PendingScheduleGroupInput[], enabled: boolean): number {
  const setTrackedDirectories = useScheduledTasksStore((state) => state.setTrackedDirectories)
  const loadGroup = useScheduledTasksStore((state) => state.loadGroup)
  const loadGroups = useScheduledTasksStore((state) => state.loadGroups)
  const [now, setNow] = React.useState(() => Date.now())
  const directoriesKey = groups.map((group) => group.directory).join("\u0000")
  const groupsRef = React.useRef(groups)
  groupsRef.current = groups

  // Track the registered directories and load the new ones.
  React.useEffect(() => {
    const directories = enabled && directoriesKey ? directoriesKey.split("\u0000") : []
    const added = setTrackedDirectories(directories)
    if (added.length > 0) {
      void loadGroups(added)
    }
  }, [directoriesKey, enabled, loadGroups, setTrackedDirectories])

  // Stop tracking when the section unmounts, so a stale cache is not shown
  // (or mutated by late responses) the next time it mounts.
  React.useEffect(() => () => void setTrackedDirectories([]), [setTrackedDirectories])

  // Runtime events: debounce per directory; a directory-less event reloads
  // every tracked project once.
  React.useEffect(() => {
    if (!enabled) {
      return
    }
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const ALL = "\u0000all"
    const schedule = (key: string, run: () => void) => {
      const existing = timers.get(key)
      if (existing) {
        clearTimeout(existing)
      }
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          run()
        }, EVENT_DEBOUNCE_MS),
      )
    }
    const unsubscribe = subscribeScheduledTaskEvents((event) => {
      const known = groupsRef.current.map((group) => group.directory)
      const owners = directoriesForScheduledTaskEvent(event, known, useScheduledTasksStore.getState().groups)
      if (owners === "all") {
        schedule(ALL, () => void loadGroups(groupsRef.current.map((group) => group.directory)))
        return
      }
      for (const owner of owners) {
        schedule(owner, () => void loadGroup(owner))
      }
    })
    return () => {
      unsubscribe()
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [enabled, loadGroup, loadGroups])

  // Ticker: advance the clock and reload projects whose next run is due.
  React.useEffect(() => {
    if (!enabled) {
      return
    }
    const lastDueReloadAt = new Map<string, number>()
    let lastFullRefreshAt = Date.now()
    const tick = () => {
      if (isDocumentHidden()) {
        return
      }
      const current = Date.now()
      setNow(current)
      if (current - lastFullRefreshAt >= FALLBACK_REFRESH_MS) {
        lastFullRefreshAt = current
        void loadGroups(groupsRef.current.map((group) => group.directory))
        return
      }
      const { groups: state } = useScheduledTasksStore.getState()
      const entries = buildPendingEntries(
        groupsRef.current.map((group) => ({ ...group, tasks: state[group.directory]?.tasks ?? [] })),
      )
      const due = selectDueReloads(entries, current, lastDueReloadAt, {
        graceMs: DUE_GRACE_MS,
        minIntervalMs: DUE_MIN_INTERVAL_MS,
      })
      for (const directory of due) {
        lastDueReloadAt.set(directory, current)
      }
      if (due.length > 0) {
        void loadGroups(due)
      }
    }
    const interval = setInterval(tick, TICK_MS)
    // Coming back to a hidden window: refresh labels at once and catch up on
    // anything missed while the ticker was idle.
    const onVisibility = () => {
      if (!isDocumentHidden()) {
        tick()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [enabled, loadGroups])

  return now
}
