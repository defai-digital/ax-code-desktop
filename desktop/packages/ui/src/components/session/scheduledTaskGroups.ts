import type { ProjectEntry } from "@/lib/api/types"

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

/** Busy/row key: task ids are only unique per directory. */
export function buildTaskRowKey(directory: string, id: string): string {
  return `${normalizeDirectory(directory)}\u0000${id}`
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
