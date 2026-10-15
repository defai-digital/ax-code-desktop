import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { resolveSessionProjectId } from "@/lib/projectStatus"
import { useProjectSessionLists } from "./useProjectSessionLists"
import type { WorktreeMeta } from "../types"

const session = (id: string, directory: string): Session =>
  ({ id, directory, title: id, time: { created: 1, updated: 1 } }) as unknown as Session

type Lists = ReturnType<typeof useProjectSessionLists>

const renderLists = (args: Parameters<typeof useProjectSessionLists>[0]): Lists => {
  let captured: Lists | null = null
  const Probe = () => {
    captured = useProjectSessionLists(args)
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() => root.render(<Probe />))
  act(() => root.unmount())
  return captured!
}

const ids = (sessions: Session[]) => sessions.map((entry) => entry.id).sort()

describe("sidebar session ownership", () => {
  const code = "/Users/dev/code"
  const repo = "/Users/dev/code/app"
  const sessions = [
    session("in-code", code),
    session("in-unregistered-repo", "/Users/dev/code/other-repo"),
    session("in-registered-repo", repo),
    session("in-repo-subfolder", "/Users/dev/code/app/packages/web"),
    session("elsewhere", "/Users/dev/notes"),
  ]

  test("a session in a subfolder is listed under the nearest project, once", () => {
    const lists = renderLists({
      sessions,
      archivedSessions: [],
      availableWorktreesByProject: new Map(),
      allProjectRoots: [code, repo],
    })
    // Before: only the exact project folder matched, so "in-unregistered-repo" was in no list.
    expect(ids(lists.getSessionsForProject({ normalizedPath: code }))).toEqual(["in-code", "in-unregistered-repo"])
    expect(ids(lists.getSessionsForProject({ normalizedPath: repo }))).toEqual([
      "in-registered-repo",
      "in-repo-subfolder",
    ])
  })

  test("a project worktree outside the project folder belongs to that project", () => {
    const worktree = "/Users/dev/.worktrees/app-feature"
    const worktrees = new Map<string, WorktreeMeta[]>([[repo, [{ path: worktree } as WorktreeMeta]]])
    const lists = renderLists({
      sessions: [session("in-worktree", worktree)],
      archivedSessions: [],
      availableWorktreesByProject: worktrees,
      allProjectRoots: [code, repo],
    })
    expect(ids(lists.getSessionsForProject({ normalizedPath: repo }))).toEqual(["in-worktree"])
    expect(lists.getSessionsForProject({ normalizedPath: code })).toEqual([])
  })

  test("the sidebar and the projects home agree on every owner", () => {
    const projects = [
      { id: "code", path: code },
      { id: "app", path: repo },
    ]
    const lists = renderLists({
      sessions,
      archivedSessions: [],
      availableWorktreesByProject: new Map(),
      allProjectRoots: [code, repo],
    })
    const sidebarOwner = (id: string) =>
      projects.find((project) =>
        lists.getSessionsForProject({ normalizedPath: project.path }).some((entry) => entry.id === id),
      )?.id ?? null
    for (const entry of sessions) {
      const homeOwner = resolveSessionProjectId(
        { directory: (entry as Session & { directory: string }).directory },
        projects,
      )
      expect(sidebarOwner(entry.id), entry.id).toBe(homeOwner)
    }
  })
})
