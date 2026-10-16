import React from "react"
import { useRuntimeAPIs } from "@/hooks/useRuntimeAPIs"

type ProjectKnowledgeState = {
  /** True when any project knowledge file (AGENTS.md or CLAUDE.md) exists. */
  exists: boolean
  /** True when a project-level AGENTS.md exists (AX Code primary). */
  agentsMd: boolean
  /** True when a project-level CLAUDE.md exists (compat / secondary). */
  claudeMd: boolean
  isLoading: boolean
}

const EMPTY: ProjectKnowledgeState = { exists: false, agentsMd: false, claudeMd: false, isLoading: false }

// A positive probe is cached so a remount does not flash "checking" over a file that is still there. It
// expires, because the file can be deleted — or the directory can be switched to a branch without it — while
// the app stays open, and the chip would go on claiming knowledge the project no longer has.
const POSITIVE_CACHE_TTL_MS = 30_000

type CachedProjectKnowledge = { state: ProjectKnowledgeState; cachedAt: number }

const cache = new Map<string, CachedProjectKnowledge>()

const readCachedProjectKnowledge = (directory: string): ProjectKnowledgeState | undefined => {
  const entry = cache.get(directory)
  if (!entry) {
    return undefined
  }
  if (Date.now() - entry.cachedAt > POSITIVE_CACHE_TTL_MS) {
    cache.delete(directory)
    return undefined
  }
  return entry.state
}

/**
 * Detects whether project knowledge files exist in the given workspace
 * directory. AX Code prefers project-level AGENTS.md (also reads CLAUDE.md
 * for compatibility). Surfaces existence for the draft welcome indicator.
 */
export function useProjectKnowledge(directory: string | null | undefined): ProjectKnowledgeState {
  const { files } = useRuntimeAPIs()
  const [state, setState] = React.useState<ProjectKnowledgeState>(() => {
    if (!directory) return EMPTY
    return readCachedProjectKnowledge(directory) ?? { ...EMPTY, isLoading: true }
  })

  React.useEffect(() => {
    const readFile = files.readFile
    if (!directory || !readFile) {
      setState(EMPTY)
      return
    }

    const cached = readCachedProjectKnowledge(directory)
    if (cached) {
      setState(cached)
      return
    }

    let cancelled = false
    setState({ ...EMPTY, isLoading: true })

    const base = directory.replace(/\/$/, "")
    const probe = (name: string) =>
      readFile(`${base}/${name}`)
        .then(() => true)
        .catch(() => false)

    Promise.all([probe("AGENTS.md"), probe("CLAUDE.md")]).then(([agentsMd, claudeMd]) => {
      if (cancelled) return
      const next: ProjectKnowledgeState = {
        exists: agentsMd || claudeMd,
        agentsMd,
        claudeMd,
        isLoading: false,
      }
      // Only cache a positive probe. A cached miss would permanently hide the
      // knowledge file the "create" chip then adds — the next mount must
      // re-probe instead.
      if (next.exists) {
        cache.set(directory, { state: next, cachedAt: Date.now() })
      }
      setState(next)
    })

    return () => {
      cancelled = true
    }
  }, [directory, files])

  return state
}

/**
 * Builds a display label naming the detected project knowledge file(s).
 * AGENTS.md is listed first (AX Code primary); CLAUDE.md is secondary compat.
 * Returns an empty string when none are present.
 */
export function projectKnowledgeFileLabel(state: ProjectKnowledgeState): string {
  const files: string[] = []
  if (state.agentsMd) files.push("AGENTS.md")
  if (state.claudeMd) files.push("CLAUDE.md")
  return files.join(" + ")
}
