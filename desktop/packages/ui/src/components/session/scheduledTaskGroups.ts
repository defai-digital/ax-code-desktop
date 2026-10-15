import type { ProjectEntry } from "@/lib/api/types"
import type { ScheduledTask } from "@/lib/scheduledTasksApi"

export const ALL_PROJECTS_VALUE = "__all"

/**
 * Normalize a project directory for use as a group key.
 * Trims whitespace and strips trailing slashes, except for the root "/".
 */
export function normalizeDirectory(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return ""
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed === "/") {
    return "/"
  }
  const stripped = trimmed.replace(/\/+$/, "")
  return stripped === "" ? "/" : stripped
}

export type ProjectGroupDescriptor = {
  /** Normalized directory that keys the group. */
  directory: string
  project: ProjectEntry
}

/**
 * Deduplicate projects that share the same normalized path.
 * The first project for a path wins and the original order is preserved.
 */
export function buildProjectGroups(projects: readonly ProjectEntry[]): ProjectGroupDescriptor[] {
  const seen = new Set<string>()
  const groups: ProjectGroupDescriptor[] = []
  for (const project of projects) {
    const directory = normalizeDirectory(project.path)
    if (!directory || seen.has(directory)) {
      continue
    }
    seen.add(directory)
    groups.push({ directory, project })
  }
  return groups
}

/** Map from normalized directory to the first project registered for it. */
export function buildDirectoryToProjectMap(projects: readonly ProjectEntry[]): Map<string, ProjectEntry> {
  const map = new Map<string, ProjectEntry>()
  for (const group of buildProjectGroups(projects)) {
    map.set(group.directory, group.project)
  }
  return map
}

/** Return a sorted copy: active first, then title, then next run time. */
export function sortScheduledTasks(tasks: readonly ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((a, b) => {
    const aActive = a.status === "active"
    const bActive = b.status === "active"
    if (aActive !== bActive) {
      return aActive ? -1 : 1
    }
    const byName = a.title.localeCompare(b.title)
    if (byName !== 0) {
      return byName
    }
    return (a.nextRunAt || Number.MAX_SAFE_INTEGER) - (b.nextRunAt || Number.MAX_SAFE_INTEGER)
  })
}

export type ScheduledTaskGroupSnapshot = {
  directory?: string
  tasks: readonly ScheduledTask[]
  error?: string | null
  /** Whether the group has ever loaded successfully. Defaults to `!error`. */
  hasLoaded?: boolean
}

export type ScheduledTasksSummary = {
  active: number
  total: number
  projects: number
  running: number
  failing: number
  unavailable: number
}

const isLoadedGroup = (group: ScheduledTaskGroupSnapshot): boolean =>
  typeof group.hasLoaded === "boolean" ? group.hasLoaded : !group.error

/** Summary counts derive only from loaded groups. */
export function computeSummary(groups: readonly ScheduledTaskGroupSnapshot[]): ScheduledTasksSummary {
  let active = 0
  let total = 0
  let running = 0
  let failing = 0
  let projects = 0

  for (const group of groups) {
    if (!isLoadedGroup(group)) {
      continue
    }
    projects += 1
    for (const task of group.tasks) {
      total += 1
      if (task.status === "active") {
        active += 1
      }
      if (task.lastRunStatus === "running") {
        running += 1
      }
      if (task.lastRunStatus === "error") {
        failing += 1
      }
    }
  }

  const unavailable = groups.filter((group) => Boolean(group.error)).length
  return { active, total, projects, running, failing, unavailable }
}

/** Alias kept readable at call sites that talk about groups. */
export const summarizeGroups = computeSummary

/**
 * Resolve which known groups an event should reload.
 * No directory reloads every known group; a matching normalized directory
 * reloads only that group; an unknown directory reloads nothing.
 */
export function resolveEventTargetDirectories(
  eventDirectory: string | null | undefined,
  knownDirectories: readonly string[],
): string[] {
  const known: string[] = []
  const seen = new Set<string>()
  for (const directory of knownDirectories) {
    const normalized = normalizeDirectory(directory)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    known.push(normalized)
  }
  if (!eventDirectory || !eventDirectory.trim()) {
    return [...known]
  }
  const target = normalizeDirectory(eventDirectory)
  return seen.has(target) ? [target] : []
}

/** Busy/row key: task ids are only unique per directory. */
export function buildTaskRowKey(directory: string, id: string): string {
  return `${normalizeDirectory(directory)}\u0000${id}`
}

/** Normalized owning directory for a task row. */
export function directoryForTask(task: Pick<ScheduledTask, "directory">): string {
  return normalizeDirectory(task.directory)
}

/**
 * Resolve a task to its group directory through the normalized
 * directory -> group map. Falls back to the task's normalized directory.
 */
export function groupDirectoryForTask(
  task: Pick<ScheduledTask, "directory">,
  knownDirectories: readonly string[],
): string {
  const targets = resolveEventTargetDirectories(task.directory, knownDirectories)
  return targets.length === 1 ? targets[0] : directoryForTask(task)
}

/** Run `fn` over items with at most `limit` promises in flight, preserving order. */
export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  const concurrency = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1))
  let index = 0
  const worker = async () => {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await fn(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}
