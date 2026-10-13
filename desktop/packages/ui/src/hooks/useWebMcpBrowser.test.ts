import { afterEach, describe, expect, test, vi } from "vitest"
import { ensureSessionForProjectBrowser } from "./useWebMcpBrowser"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useDirectoryStore } from "@/stores/useDirectoryStore"

const sessionSnapshot = useSessionUIStore.getState()
const directorySnapshot = useDirectoryStore.getState()

afterEach(() => {
  useSessionUIStore.setState(sessionSnapshot, true)
  useDirectoryStore.setState(directorySnapshot, true)
})

describe("ensureSessionForProjectBrowser", () => {
  test("keeps the current session when one is selected", async () => {
    const createSession = vi.fn()
    useSessionUIStore.setState({ currentSessionId: "ses_live", createSession })
    await expect(ensureSessionForProjectBrowser("Project browser")).resolves.toBe(true)
    expect(createSession).not.toHaveBeenCalled()
  })

  test("starts a session in the draft's project when none is selected", async () => {
    const createSession = vi.fn(async () => ({ id: "ses_new" }))
    useSessionUIStore.setState({
      currentSessionId: null,
      newSessionDraft: { ...sessionSnapshot.newSessionDraft, open: true, directoryOverride: "/Users/dev/app" },
      createSession: createSession as unknown as typeof sessionSnapshot.createSession,
    })
    await expect(ensureSessionForProjectBrowser("Project browser")).resolves.toBe(true)
    expect(createSession).toHaveBeenCalledWith("Project browser", "/Users/dev/app")
  })

  test("falls back to the current directory and reports when nothing can be started", async () => {
    const createSession = vi.fn(async () => null)
    useSessionUIStore.setState({
      currentSessionId: null,
      newSessionDraft: { ...sessionSnapshot.newSessionDraft, open: true, directoryOverride: null },
      createSession: createSession as unknown as typeof sessionSnapshot.createSession,
    })
    useDirectoryStore.setState({ currentDirectory: "/Users/dev/other" })
    await expect(ensureSessionForProjectBrowser("Project browser")).resolves.toBe(false)
    expect(createSession).toHaveBeenCalledWith("Project browser", "/Users/dev/other")
  })
})
