import type { ScheduledTaskRun } from "@/lib/scheduledTasksApi"

/** Runs loaded per task, and shown in total, by the history dialog; the runtime returns newest first. */
export const SCHEDULED_TASK_RUN_HISTORY_LIMIT = 20

/** How the history dialog groups the runtime's run statuses. */
export type ScheduledTaskRunOutcome = "running" | "success" | "failed" | "timeout" | "skipped"

export const runOutcome = (run: Pick<ScheduledTaskRun, "status">): ScheduledTaskRunOutcome => {
  switch (run.status) {
    case "running":
      return "running"
    case "completed":
      return "success"
    case "failed":
      return "failed"
    case "timeout":
      return "timeout"
    case "skipped_overlap":
    case "missed_skip":
      return "skipped"
  }
}

/** When the run began: its start, else the slot it was due, else when it was recorded. */
export const runStartedAt = (run: ScheduledTaskRun): number => run.timeStarted ?? run.occurrenceAt ?? run.time.created

/** Wall-clock duration of a finished run; undefined while running or when the runtime lacks either end. */
export const runDurationMs = (run: ScheduledTaskRun): number | undefined => {
  if (run.timeStarted === undefined || run.timeCompleted === undefined) return undefined
  const duration = run.timeCompleted - run.timeStarted
  return duration >= 0 ? duration : undefined
}

/**
 * Newest first across every member of a family, de-duplicated by run id and
 * capped, so a fan-out task reads as one history.
 */
export const mergeScheduledTaskRuns = (runs: readonly ScheduledTaskRun[], limit: number): ScheduledTaskRun[] => {
  const byId = new Map<string, ScheduledTaskRun>()
  for (const run of runs) {
    if (!byId.has(run.id)) byId.set(run.id, run)
  }
  return [...byId.values()]
    .sort((a, b) => runStartedAt(b) - runStartedAt(a) || b.id.localeCompare(a.id))
    .slice(0, Math.max(0, limit))
}

export type ScheduledTaskRunSummary = {
  /** Finished runs that count toward health (skipped and running ones excluded). */
  finished: number
  succeeded: number
  failed: number
  skipped: number
  running: number
  /** Failed or timed-out runs in a row, counted from the newest finished run. */
  failureStreak: number
}

export const summarizeScheduledTaskRuns = (runs: readonly ScheduledTaskRun[]): ScheduledTaskRunSummary => {
  const summary: ScheduledTaskRunSummary = {
    finished: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    running: 0,
    failureStreak: 0,
  }
  let streakOpen = true
  for (const run of runs) {
    const outcome = runOutcome(run)
    if (outcome === "running") {
      summary.running += 1
      continue
    }
    if (outcome === "skipped") {
      summary.skipped += 1
      continue
    }
    summary.finished += 1
    if (outcome === "success") {
      summary.succeeded += 1
      streakOpen = false
    } else {
      summary.failed += 1
      if (streakOpen) summary.failureStreak += 1
    }
  }
  return summary
}

/** Compact duration such as "45s", "3m 20s" or "1h 5m". */
export const formatRunDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`
}
