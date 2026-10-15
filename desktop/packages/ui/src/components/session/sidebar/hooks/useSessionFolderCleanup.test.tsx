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
  sessions: Session[]
  archivedSessions: Session[]
}): void => {
  const Probe = () => {
    useSessionFolderCleanup({
      ...args,
      normalizedProjects: [],
      availableWorktreesByProject: new Map(),
      cleanupSessions: useSessionFoldersStore.getState().cleanupSessions,
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

  test("still drops the folder entry of a session that is gone", () => {
    renderCleanup({ isSessionsLoading: false, sessions: [], archivedSessions: [] })

    expect(useSessionFoldersStore.getState().getSessionFolderId(SCOPE, SESSION_ID)).toBeNull()
  })
})
