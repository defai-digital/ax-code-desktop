import React from "react"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from "@/stores/useGlobalSessionsStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionPinnedStore } from "@/stores/useSessionPinnedStore"
import { useGitAllBranches } from "@/stores/useGitStore"
import type { SessionNode, SessionSecondaryMeta } from "../types"
import { orderSwitcherSessionIds, sessionNeedsSwitcherAttention } from "@/lib/needsYou"
import { useNeedsYouSessionInputs } from "@/hooks/useNeedsYouSessions"
import { compareSessionsByPinnedAndTime, isPathWithinProject } from "../utils"

type SwitcherItem = {
  node: SessionNode
  projectId: string | null
  groupDirectory: string | null
  secondaryMeta: SessionSecondaryMeta | null
}

const MAX_PARENT_SESSIONS = 7

type SwitcherItemsOptions = {
  scopeProjectId?: string | null
}

const normalize = (value: string | null | undefined): string | null => {
  if (!value) return null
  const replaced = value.replace(/\\/g, "/")
  if (replaced === "/") return "/"
  return replaced.length > 1 ? replaced.replace(/\/+$/, "") : replaced
}

const formatProjectLabel = (project: { label?: string | null; path: string } | null): string | null => {
  if (!project) return null
  const trimmed = project.label?.trim()
  if (trimmed) return trimmed
  const segments = project.path.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? null
}

export const useSwitcherItems = (enabled: boolean, options: SwitcherItemsOptions = {}): SwitcherItem[] => {
  const { scopeProjectId = null } = options
  const activeSessions = useGlobalSessionsStore((state) => state.activeSessions)
  const projects = useProjectsStore((state) => state.projects)
  const pinnedSessionIds = useSessionPinnedStore((state) => state.ids)
  const branchesByDirectory = useGitAllBranches()
  const needsYouInputs = useNeedsYouSessionInputs()
  const attentionIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const session of needsYouInputs) {
      if (sessionNeedsSwitcherAttention(session)) ids.add(session.id)
    }
    for (const session of activeSessions) {
      const parentId = (session as Session & { parentID?: string | null }).parentID
      if (parentId && ids.has(session.id)) ids.add(parentId)
    }
    return ids
  }, [activeSessions, needsYouInputs])

  const normalizedProjects = React.useMemo(
    () =>
      projects
        .map((project) => ({ ...project, normalizedPath: normalize(project.path) }))
        .filter((project) => project.normalizedPath),
    [projects],
  )

  const findProjectForDirectory = React.useCallback(
    (directory: string | null) => {
      if (!directory) return null
      const matches = normalizedProjects
        .filter((project) => isPathWithinProject(directory, project.normalizedPath))
        .sort((a, b) => (b.normalizedPath?.length ?? 0) - (a.normalizedPath?.length ?? 0))
      return matches[0] ?? null
    },
    [normalizedProjects],
  )

  const items = React.useMemo<SwitcherItem[]>(() => {
    if (!enabled) return []

    const childrenByParent = new Map<string, Session[]>()
    for (const session of activeSessions) {
      const parentId = (session as Session & { parentID?: string | null }).parentID
      if (!parentId) continue
      if (session.time?.archived) continue
      const bucket = childrenByParent.get(parentId)
      if (bucket) {
        bucket.push(session)
      } else {
        childrenByParent.set(parentId, [session])
      }
    }
    childrenByParent.forEach((list) => {
      list.sort((a, b) => compareSessionsByPinnedAndTime(a, b, pinnedSessionIds))
    })

    const rankedParents = activeSessions
      .filter((session) => !session.time?.archived)
      .filter((session) => !(session as Session & { parentID?: string | null }).parentID)
      .filter((session) => {
        if (!scopeProjectId) return true
        const directory = resolveGlobalSessionDirectory(session)
        return findProjectForDirectory(directory)?.id === scopeProjectId
      })
      .sort((a, b) => compareSessionsByPinnedAndTime(a, b, pinnedSessionIds))
    const orderedParentIds = orderSwitcherSessionIds(
      rankedParents.map((session) => session.id),
      attentionIds,
    )
    const parentById = new Map(rankedParents.map((session) => [session.id, session]))
    const parents = orderedParentIds
      .slice(0, MAX_PARENT_SESSIONS)
      .flatMap((id) => {
        const session = parentById.get(id)
        return session ? [session] : []
      })

    const buildNode = (session: Session): SessionNode => {
      const childSessions = childrenByParent.get(session.id) ?? []
      return {
        session,
        children: childSessions.map((child) => buildNode(child)),
        worktree: null,
      }
    }

    return parents.map((session) => {
      const directory = resolveGlobalSessionDirectory(session)
      const matchedProject = findProjectForDirectory(directory)
      const projectLabel = formatProjectLabel(matchedProject)
      const branchLabel = directory ? (branchesByDirectory.get(directory) ?? null) : null
      return {
        node: buildNode(session),
        projectId: matchedProject?.id ?? null,
        groupDirectory: directory,
        secondaryMeta: {
          projectLabel,
          branchLabel: branchLabel && branchLabel !== projectLabel ? branchLabel : null,
        },
      }
    })
  }, [activeSessions, attentionIds, branchesByDirectory, enabled, findProjectForDirectory, pinnedSessionIds, scopeProjectId])

  return items
}
