import { formatDirectoryName, formatPathForDisplay } from "@/lib/utils"
import { formatProjectLabel, normalizePath } from "./utils"

type ProjectLabelInput = { id: string; path: string; label?: string | null }

/** Compare displayed labels, since formatting can make different names collide. */
export function sidebarProjectLabels(projects: readonly ProjectLabelInput[], home: string | null, homeLabel: string) {
  const labels = projects.map(project => ({
    id: project.id,
    label: formatProjectLabel(project.label?.trim() ||
      (home && normalizePath(project.path) === normalizePath(home) ? homeLabel : "") ||
      formatDirectoryName(project.path, home || undefined) || project.path),
    description: formatPathForDisplay(project.path, home),
  }))
  const counts = new Map<string, number>()
  for (const entry of labels) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1)
  return new Map(labels.map(entry => {
    const ambiguous = (counts.get(entry.label) ?? 0) > 1
    return [entry.id, { ...entry, ambiguous, contextLabel: ambiguous ? `${entry.label} · ${entry.description}` : entry.label }]
  }))
}
