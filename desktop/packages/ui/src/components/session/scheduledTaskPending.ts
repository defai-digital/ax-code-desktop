/**
 * The sidebar's "Scheduled" section lists every project's task families in
 * one pending-first queue: what is running now, then what fires next.
 */

import type { ProjectEntry } from "@/lib/api/types"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"
import { groupScheduledTaskFamilies, type ScheduledTaskFamily } from "./scheduledTaskFamilies"

export type PendingScheduleEntry = {
  /** Unique across projects: task ids are only unique per directory. */
  key: string
  directory: string
  project: ProjectEntry
  family: ScheduledTaskFamily
}

export type PendingScheduleGroupInput = {
  directory: string
  project: ProjectEntry
  tasks: readonly ScheduledTask[]
}

export const pendingEntryKey = (directory: string, familyKey: string): string => `${directory}\u0000${familyKey}`

/**
 * 0 running, 1 needs attention (an active family whose last run failed, or
 * one the runtime paused after repeated failures), 2 active with a next run,
 * 3 active without one, 4 paused by the user, 5 completed (a one-time task
 * that already ran). A failing task is lifted above healthy ones so it is not
 * buried in a long queue; completed tasks are history and sit below the
 * paused ones the user may still resume.
 */
export const pendingRank = (family: ScheduledTaskFamily): number => {
  if (family.lastRunStatus === "running") return 0
  if (family.completed) return 5
  if (family.pausedByFailure) return 1
  if (!family.anyActive) return 4
  if (family.lastRunStatus === "error") return 1
  return typeof family.nextRunAt === "number" ? 2 : 3
}

export const comparePendingEntries = (a: PendingScheduleEntry, b: PendingScheduleEntry): number => {
  const rankA = pendingRank(a.family)
  const rank = rankA - pendingRank(b.family)
  if (rank !== 0) return rank
  if (rankA <= 2) {
    const byNext = (a.family.nextRunAt ?? Number.MAX_SAFE_INTEGER) - (b.family.nextRunAt ?? Number.MAX_SAFE_INTEGER)
    if (byNext !== 0) return byNext
  }
  const byTitle = a.family.title.localeCompare(b.family.title)
  if (byTitle !== 0) return byTitle
  const byDirectory = a.directory.localeCompare(b.directory)
  if (byDirectory !== 0) return byDirectory
  return a.key.localeCompare(b.key)
}

export const buildPendingEntries = (groups: readonly PendingScheduleGroupInput[]): PendingScheduleEntry[] => {
  const entries: PendingScheduleEntry[] = []
  for (const group of groups) {
    for (const family of groupScheduledTaskFamilies(group.tasks)) {
      entries.push({
        key: pendingEntryKey(group.directory, family.key),
        directory: group.directory,
        project: group.project,
        family,
      })
    }
  }
  return entries.sort(comparePendingEntries)
}

export type PendingScheduleSummary = {
  total: number
  active: number
  running: number
  failing: number
  /** Soonest next run among active families. */
  nextRunAt?: number
}

export const summarizePendingEntries = (entries: readonly PendingScheduleEntry[]): PendingScheduleSummary => {
  let active = 0
  let running = 0
  let failing = 0
  let nextRunAt: number | undefined
  for (const { family } of entries) {
    if (family.anyActive) active += 1
    if (family.lastRunStatus === "running") running += 1
    // Same rule as pendingRank: a task the user paused reads as paused even
    // when its last run failed, so the header does not count it; one the
    // runtime paused after repeated failures will not run again until the
    // user acts, so it does.
    if (family.pausedByFailure || (family.anyActive && family.lastRunStatus === "error")) failing += 1
    if (family.anyActive && typeof family.nextRunAt === "number") {
      nextRunAt = nextRunAt === undefined ? family.nextRunAt : Math.min(nextRunAt, family.nextRunAt)
    }
  }
  return { total: entries.length, active, running, failing, ...(nextRunAt !== undefined ? { nextRunAt } : {}) }
}

/**
 * Directories to reload because an active family's next run is due by
 * `now - graceMs`: the runtime has fired (or is about to fire) it, so the
 * listed next run and last result are stale. A directory reloaded for this
 * within `minIntervalMs` is skipped, so a runtime that has not advanced the
 * next run yet does not cause a reload loop.
 */
export const selectDueReloads = (
  entries: readonly PendingScheduleEntry[],
  now: number,
  lastDueReloadAt: ReadonlyMap<string, number>,
  options: { graceMs: number; minIntervalMs: number },
): string[] => {
  const due = new Set<string>()
  for (const { directory, family } of entries) {
    if (!family.anyActive || typeof family.nextRunAt !== "number") continue
    if (family.nextRunAt > now - options.graceMs) continue
    const last = lastDueReloadAt.get(directory)
    if (last !== undefined && now - last < options.minIntervalMs) continue
    due.add(directory)
  }
  return [...due]
}
