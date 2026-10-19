import { beforeEach, describe, expect, test, vi } from "vitest"

const createSessionAction = vi.fn()

vi.mock("./session-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./session-actions")>()
  return { ...actual, createSession: (...args: unknown[]) => createSessionAction(...args) }
})

const { useSessionUIStore, getNewSessionDraftRevision } = await import("./session-ui-store")

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
      currentSessionId: null,
      draftCreateInFlight: false,
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

  test("restores the original draft after the chat container auto-opened one during the create", async () => {
    // createSession closes the draft before the request. ChatContainer keeps a generic draft
    // open during the flight so the composer stays mounted, but that auto-open must not move
    // the lifecycle revision: restoreDraft compares against the close's revisionAtStart + 1.
    let rejectCreate!: (error: Error) => void
    createSessionAction.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectCreate = reject
      }),
    )
    const revisionBefore = getNewSessionDraftRevision()
    const unsubscribe = useSessionUIStore.subscribe((state) => {
      if (!state.draftCreateInFlight) return
      if (!state.currentSessionId && !state.newSessionDraft?.open) {
        useSessionUIStore.getState().openNewSessionDraft({ preserveLifecycleRevision: true })
      }
    })

    try {
      const create = useSessionUIStore.getState().createSession("compose", "/proj-b", "session-parent")
      // The generic draft is open while the request is pending, which keeps the composer
      // available, and the close's +1 is still the current revision.
      expect(useSessionUIStore.getState().newSessionDraft?.open).toBe(true)
      expect(getNewSessionDraftRevision()).toBe(revisionBefore + 1)

      rejectCreate(new Error("runtime unavailable"))
      await expect(create).resolves.toBeNull()
    } finally {
      unsubscribe()
    }

    const restored = useSessionUIStore.getState().newSessionDraft
    expect(restored?.open).toBe(true)
    expect(restored?.directoryOverride).toBe("/proj-b")
    expect(restored?.targetFolderId).toBe("folder-1")
    expect(restored?.parentID).toBe("session-parent")
    expect(restored?.title).toBe("compose")
    expect(getNewSessionDraftRevision()).toBe(revisionBefore + 1)
  })

  test("selecting the created session closes the draft opened during the flight", async () => {
    let resolveCreate!: (value: { id: string; directory: string }) => void
    createSessionAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )

    const create = useSessionUIStore.getState().createSession("compose", "/proj-b", null)
    useSessionUIStore.getState().openNewSessionDraft({ preserveLifecycleRevision: true })
    expect(useSessionUIStore.getState().newSessionDraft?.open).toBe(true)

    resolveCreate({ id: "session-1", directory: "/proj-b" })
    await expect(create).resolves.toMatchObject({ id: "session-1" })

    useSessionUIStore.getState().setCurrentSession("session-1", "/proj-b")
    expect(useSessionUIStore.getState().newSessionDraft?.open).toBe(false)
  })

  test("does not restore the old draft over one opened while the create was in flight", async () => {
    let resolveCreate!: (value: null) => void
    createSessionAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )

    const create = useSessionUIStore.getState().createSession("compose", "/proj-b", "session-parent")
    // The user opened another draft while the create was in flight.
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/proj-c" })
    resolveCreate(null)

    await expect(create).resolves.toBeNull()
    const current = useSessionUIStore.getState().newSessionDraft
    expect(current?.open).toBe(true)
    expect(current?.directoryOverride).toBe("/proj-c")
  })

  test("sendMessage rejects a stale draft revision instead of sending to the new draft's target", async () => {
    const revision = getNewSessionDraftRevision()
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/proj-c" })

    await expect(
      useSessionUIStore
        .getState()
        .sendMessage("hello", "provider", "model", undefined, undefined, undefined, undefined, undefined, undefined, {
          fromNewSessionDraft: true,
          draftRevision: revision,
        }),
    ).rejects.toThrow("Cannot send message without an active session or draft")
    expect(createSessionAction).not.toHaveBeenCalled()
  })
})
