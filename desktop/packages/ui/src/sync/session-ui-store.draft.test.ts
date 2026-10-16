import { beforeEach, describe, expect, test, vi } from "vitest"

const createSessionAction = vi.fn()

vi.mock("./session-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session-actions")>()
  return { ...actual, createSession: (...args: unknown[]) => createSessionAction(...args) }
})

const { useSessionUIStore } = await import("./session-ui-store")

const draft = () => ({
  open: true,
  title: "compose",
  directoryOverride: "/proj-b",
  bootstrapPendingDirectory: "/proj-b",
  selectedProjectId: "proj-b",
  targetFolderId: "folder-1",
  parentID: "session-parent",
  syntheticParts: [],
})

describe("createSession draft rollback", () => {
  beforeEach(() => {
    createSessionAction.mockReset()
    useSessionUIStore.setState({
      newSessionDraft: draft() as never,
      error: null,
    })
  })

  test("puts the draft back when the session could not be created", async () => {
    // The draft carries the project, parent session and folder the user chose and is closed before
    // the request, so losing it sent the retry to whatever directory the app was on instead.
    createSessionAction.mockRejectedValueOnce(new Error("runtime unavailable"))

    await expect(useSessionUIStore.getState().createSession("compose", "/proj-b", "session-parent")).resolves.toBeNull()

    const restored = useSessionUIStore.getState().newSessionDraft
    expect(restored?.open).toBe(true)
    expect(restored?.directoryOverride).toBe("/proj-b")
    expect(restored?.targetFolderId).toBe("folder-1")
    expect(restored?.parentID).toBe("session-parent")
  })

  test("puts the draft back when the create answered without a session", async () => {
    createSessionAction.mockResolvedValueOnce(null)

    await expect(useSessionUIStore.getState().createSession("compose", "/proj-b", "session-parent")).resolves.toBeNull()

    expect(useSessionUIStore.getState().newSessionDraft?.open).toBe(true)
  })

  test("leaves the draft closed once the session exists", async () => {
    createSessionAction.mockResolvedValueOnce({ id: "session-1", directory: "/proj-b" })

    const created = await useSessionUIStore.getState().createSession("compose", "/proj-b", null)

    expect(created?.id).toBe("session-1")
    expect(useSessionUIStore.getState().newSessionDraft?.open).toBeFalsy()
  })
})
