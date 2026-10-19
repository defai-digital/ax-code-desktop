import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { useSessionFoldersStore } from "@/stores/useSessionFoldersStore"
import { useSessionFolderCleanup } from "./useSessionFolderCleanup"

const SCOPE = "/Users/dev/code"
const SESSION_ID = "session-1"

const session = (id: string): Session =>
  ({ id, directory: SCOPE, title: id, time: { created: 1, updated: 1 } }) as unknown as Session

const renderCleanup = (args: {
  isSessionsLoading: boolean
  hasLoadedGlobalSessions?: boolean
  sessions: Session[]
  archivedSessions: Session[]
  normalizedProjects?: Array<{ id: string; normalizedPath: string }>
  cleanupSessions?: (scopeKey: string, validSessionIds: Set<string>) => void
}): void => {
  const Probe = () => {
    useSessionFolderCleanup({
      ...args,
      hasLoadedGlobalSessions: args.hasLoadedGlobalSessions ?? true,
      normalizedProjects: args.normalizedProjects ?? [],
      availableWorktreesByProject: new Map(),
      cleanupSessions: args.cleanupSessions ?? useSessionFoldersStore.getState().cleanupSessions,
    })
    return null
  }
  const root = createRoot(document.createElement("div"))
  act(() => root.render(<Probe />))
  act(() => root.unmount())
}

describe("session folder cleanup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => null })))
    useSessionFoldersStore.setState({ foldersMap: {}, collapsedFolderIds: new Set() })
    const folder = useSessionFoldersStore.getState().createFolder(SCOPE, "Manual")
    useSessionFoldersStore.getState().addSessionToFolder(SCOPE, folder.id, SESSION_ID)
    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, SESSION_ID)).toBe(folder.id)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("keeps an archived session's manual folder placement", () => {
    // Regression: archiving removes the session from `sessions`, and the cleanup
    // pruned it from its folder — so undoing the archive brought the session back
    // without its folder. Archived sessions still exist, so they count here.
    renderCleanup({ isSessionsLoading: false, sessions: [], archivedSessions: [session(SESSION_ID)] })

    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, SESSION_ID)).not.toBeNull()
  })

  test("keeps a nested-directory session filed under its project root group", () => {
    // The sidebar lists a session in a nested, unregistered directory inside the
    // project root group, whose folders are keyed by the project root — so the
    // membership set has to count that scope too, not just the raw directory.
    const nestedSession: Session = {
      id: "nested-1",
      directory: `${SCOPE}/other-repo`,
      title: "nested",
      time: { created: 1, updated: 1 },
    } as unknown as Session
    const folder = useSessionFoldersStore.getState().createFolder(SCOPE, "Repo work")
    useSessionFoldersStore.getState().addSessionToFolder(SCOPE, folder.id, nestedSession.id)

    renderCleanup({
      isSessionsLoading: false,
      sessions: [nestedSession],
      archivedSessions: [],
      normalizedProjects: [{ id: "p1", normalizedPath: SCOPE }],
    })

    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, nestedSession.id)).toBe(folder.id)
  })

  test("does not prune folders before the global session index has loaded", () => {
    // Cold start: the projects store has hydrated, so the scope is known, but the
    // session index is still empty. Pruning then emptied every folder and
    // persisted it. `isLoading` in the session UI store is never set in
    // production, so the not-yet-loaded flag is what has to stop the effect.
    const cleanupSessions = vi.fn()

    renderCleanup({
      isSessionsLoading: false,
      hasLoadedGlobalSessions: false,
      sessions: [],
      archivedSessions: [],
      normalizedProjects: [{ id: "p1", normalizedPath: SCOPE }],
      cleanupSessions,
    })

    expect(cleanupSessions).not.toHaveBeenCalled()
    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, SESSION_ID)).not.toBeNull()
  })

  test("still drops the folder entry of a session that is gone", () => {
    renderCleanup({
      isSessionsLoading: false,
      sessions: [],
      archivedSessions: [],
      normalizedProjects: [{ id: "p1", normalizedPath: SCOPE }],
    })

    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, SESSION_ID)).toBeNull()
  })

  test("leaves a scope alone when this snapshot cannot account for its project", () => {
    // The projects store hydrates in its own update after the session-load flag clears, so
    // a scope whose project is missing from the snapshot computed no ids - and pruning on
    // that emptied every folder in the scope and persisted it, destroying folder
    // organisation that had nothing wrong with it.
    renderCleanup({ isSessionsLoading: false, sessions: [], archivedSessions: [], normalizedProjects: [] })

    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, SESSION_ID)).not.toBeNull()
  })
})
