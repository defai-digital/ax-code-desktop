import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { resolveSessionProjectId } from "@/lib/projectStatus"
import { normalizePath } from "../utils"
import { useProjectSessionLists } from "./useProjectSessionLists"
import type { WorktreeMeta } from "../types"

// Only the hook's own path normalizations are counted: the helpers inside
// `../utils` keep calling their local binding.
vi.mock("../utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils")>()
  return { ...actual, normalizePath: vi.fn(actual.normalizePath) }
})

const session = (id: string, directory: string): Session =>
  ({ id, directory, title: id, time: { created: 1, updated: 1 } }) as unknown as Session
const archivedSession = (id: string, directory: string): Session =>
  ({ id, directory, title: id, time: { created: 1, updated: 1, archived: 2 } }) as unknown as Session
const worktreeOnlySession = (id: string, worktree: string): Session =>
  ({ id, title: id, time: { created: 1, updated: 1 }, project: { worktree } }) as unknown as Session

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

  test("archived and directory-less worktree sessions are listed under their owner only, archived first", () => {
    const worktree = "/Users/dev/.worktrees/app-feature"
    const lists = renderLists({
      sessions: [...sessions, worktreeOnlySession("worktree-only", worktree), worktreeOnlySession("no-owner", "/x")],
      archivedSessions: [
        archivedSession("archived-in-code", "/Users/dev/code/notes"),
        archivedSession("archived-in-repo", "/Users/dev/code/app/src"),
        archivedSession("archived-elsewhere", "/Users/dev/other"),
      ],
      availableWorktreesByProject: new Map([[repo, [{ path: worktree } as WorktreeMeta]]]),
      allProjectRoots: [code, repo],
    })
    expect(lists.getArchivedSessionsForProject({ normalizedPath: repo }).map((entry) => entry.id)).toEqual([
      "archived-in-repo",
      "worktree-only",
    ])
    expect(lists.getArchivedSessionsForProject({ normalizedPath: code }).map((entry) => entry.id)).toEqual([
      "archived-in-code",
    ])
    expect(lists.getArchivedSessionsForProject({ normalizedPath: "/Users/dev/other" })).toEqual([])
  })

  test("archived lists are bucketed once per rebuild, not filtered once per project", () => {
    const roots = Array.from({ length: 30 }, (_, index) => `/Users/dev/code/project-${index}`)
    const live = Array.from({ length: 50 }, (_, index) => session(`live-${index}`, `${roots[index % 30]}/src`))
    const archived = Array.from({ length: 50 }, (_, index) =>
      archivedSession(`archived-${index}`, `${roots[index % 30]}/lib`),
    )
    const lists = renderLists({
      sessions: live,
      archivedSessions: archived,
      availableWorktreesByProject: new Map(),
      allProjectRoots: roots,
    })
    vi.mocked(normalizePath).mockClear()
    const listed = roots.flatMap((root) => lists.getArchivedSessionsForProject({ normalizedPath: root }))
    expect(listed.map((entry) => entry.id).sort()).toEqual(archived.map((entry) => entry.id).sort())
    // Before: one normalization per live session per project (30 x 50). After: none per lookup.
    expect(vi.mocked(normalizePath).mock.calls.length).toBeLessThanOrEqual(live.length)
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
