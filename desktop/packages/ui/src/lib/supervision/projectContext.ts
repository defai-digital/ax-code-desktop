import { formatPathForDisplay } from "@/lib/utils"

type ProjectContext = { id: string; path: string; label?: string | null }

/** Visible context for sessions shown outside their project group. */
export function supervisionProjectLabel(
  projects: readonly ProjectContext[],
  projectId: string | null,
  directory: string | null,
  homeDirectory: string,
): string | null {
  const project = projectId ? projects.find(entry => entry.id === projectId) : undefined
  const label = project?.label?.trim()
  const path = project?.path ?? directory
  if (label) {
    const duplicate = projects.some(entry => entry.id !== projectId && entry.label?.trim() === label)
    return duplicate && path ? `${label} · ${formatPathForDisplay(path, homeDirectory)}` : label
  }
  return path ? formatPathForDisplay(path, homeDirectory) : null
}
