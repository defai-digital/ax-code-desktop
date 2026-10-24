import type { AxCodeClient, Message, Session, SessionStatus } from "@defai-digital/ax-code-sdk/v2/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { SessionMessageRecord } from "@/types/sessionMessages"
import { ChildStoreManager } from "./child-store"
import { createExternalSessionPoller, isExternalSessionStatus } from "./external-session-poller"
import { noteServerSessionStatus } from "./session-status-events"
import { EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS } from "./external-session-activity"

const user: Message = {
  id: "user",
  sessionID: "session",
  role: "user",
  time: { created: 20 },
  agent: "build",
  model: { providerID: "test", modelID: "test" },
}
const assistant: Message = {
  id: "assistant",
  sessionID: "session",
  role: "assistant",
  time: { created: 30, completed: 40 },
  finish: "stop",
  parentID: user.id,
  modelID: "test",
  providerID: "test",
  mode: "build",
  agent: "build",
  path: { cwd: "/repo", root: "/repo" },
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}
const session: Session = {
  id: "session",
  slug: "session",
  projectID: "project",
  directory: "/repo",
  title: "Session",
  version: "1",
  time: { created: 1, updated: 100 },
}

const pollers: ReturnType<typeof createExternalSessionPoller>[] = []

function setup(status?: SessionStatus, openSessionId: string | null = "session") {
  const childStores = new ChildStoreManager()
  const store = childStores.ensureChild("/repo", { bootstrap: false })
  store.setState({ session: [session], session_status: status ? { session: status } : {} })
  const messages = vi.fn(
    async (): Promise<{ data?: SessionMessageRecord[]; error?: unknown }> => ({ data: [{ info: user, parts: [] }] }),
  )
  const sdk = { session: { messages } } as unknown as AxCodeClient
  const refreshSessionList = vi.fn(async () => {})
  const poller = createExternalSessionPoller({
    childStores,
    getClient: () => sdk,
    getOpenSessionId: () => openSessionId,
    refreshSessionList,
    document,
  })
  pollers.push(poller)
  return { poller, store, messages, refreshSessionList }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100)
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
})

afterEach(() => {
  for (const poller of pollers.splice(0)) poller.dispose()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("external session polling", () => {
  test.each<SessionStatus>([{ type: "busy" }, { type: "retry", attempt: 1, message: "Retry", next: 200 }])(
    "does not overwrite runtime $type or refetch its transcript",
    async (status) => {
      const { store, messages } = setup(status)
      await vi.advanceTimersByTimeAsync(0)
      expect(messages).not.toHaveBeenCalled()
      expect(store.getState().session_status.session).toBe(status)
    },
  )

  test("refetches an open session without local status and marks an incomplete external turn busy", async () => {
    const { store, messages } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(messages).toHaveBeenCalledOnce()
    expect(store.getState().message.session).toEqual([user])
    expect(store.getState().session_status.session).toEqual({ type: "busy", lastActivityAt: 100 })
  })

  test("discovers activity in another session and clears only its own status after completion", async () => {
    const { poller, store, messages } = setup(undefined, null)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().session_status.session?.type).toBe("busy")
    expect(store.getState().message.session).toBeUndefined()
    messages.mockResolvedValue({ data: [{ info: assistant, parts: [] }] })
    await poller.tick()
    expect(store.getState().session_status.session).toBeUndefined()
    const runtime: SessionStatus = { type: "busy", lastActivityAt: 110 }
    store.setState({ session_status: { session: runtime } })
    await poller.tick()
    expect(store.getState().session_status.session).toBe(runtime)
  })

  test("refreshes the finished CLI transcript without leaving it in Live", async () => {
    const { poller, store, messages } = setup()
    await vi.advanceTimersByTimeAsync(0)
    messages.mockResolvedValue({
      data: [
        { info: assistant, parts: [] },
        { info: user, parts: [] },
      ],
    })
    await poller.tick()
    expect(store.getState().message.session).toContainEqual(assistant)
    expect(store.getState().session_status.session).toBeUndefined()
  })

  test("an equal runtime event takes ownership of a synthesized busy status", async () => {
    const { poller, store, messages } = setup()
    await vi.advanceTimersByTimeAsync(0)
    const status = store.getState().session_status.session
    expect(isExternalSessionStatus("session", status)).toBe(true)
    noteServerSessionStatus("session")
    expect(isExternalSessionStatus("session", status)).toBe(false)
    await poller.tick()
    expect(messages).toHaveBeenCalledOnce()
    poller.dispose()
    expect(store.getState().session_status.session).toBe(status)
  })

  test("does not apply an in-flight snapshot after runtime busy arrives", async () => {
    const { poller, store, messages } = setup({ type: "idle" })
    await vi.advanceTimersByTimeAsync(0)
    store.setState({ session_status: {} })
    let resolve: ((value: { data: SessionMessageRecord[] }) => void) | undefined
    messages.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = poller.tick()
    await vi.advanceTimersByTimeAsync(0)
    const runtime: SessionStatus = { type: "busy", lastActivityAt: 120 }
    store.setState({ session_status: { session: runtime } })
    noteServerSessionStatus("session")
    resolve!({ data: [{ info: assistant, parts: [] }] })
    await pending
    expect(store.getState().session_status.session).toBe(runtime)
    expect(store.getState().message.session).toEqual([user])
  })

  test("expires synthesized activity after 30 minutes without reading stale closed sessions", async () => {
    const { poller, store, messages } = setup(undefined, null)
    await vi.advanceTimersByTimeAsync(0)
    vi.setSystemTime(101 + EXTERNAL_SESSION_ACTIVITY_MAX_AGE_MS)
    await poller.tick()
    expect(store.getState().session_status.session).toBeUndefined()
    expect(messages).toHaveBeenCalledOnce()
  })

  test("polls every three seconds only while visible, resumes immediately, and disposes", async () => {
    const { poller, messages, refreshSessionList } = setup()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(3000)
    expect(messages).toHaveBeenCalledTimes(2)
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(6000)
    expect(messages).toHaveBeenCalledTimes(2)
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(0)
    expect(messages).toHaveBeenCalledTimes(3)
    expect(refreshSessionList).toHaveBeenCalledTimes(3)
    poller.dispose()
    await vi.advanceTimersByTimeAsync(6000)
    document.dispatchEvent(new Event("visibilitychange"))
    expect(messages).toHaveBeenCalledTimes(3)
  })

  test("logs SDK failures softly and tries again on the next tick", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { poller, store, messages, refreshSessionList } = setup({ type: "idle" })
    await vi.advanceTimersByTimeAsync(0)
    refreshSessionList.mockRejectedValueOnce(new Error("offline"))
    messages.mockResolvedValueOnce({ error: { message: "unavailable" } })
    const before = store.getState()
    await poller.tick()
    expect(store.getState()).toBe(before)
    expect(warn).toHaveBeenCalledTimes(2)
    await poller.tick()
    expect(messages).toHaveBeenCalledTimes(3)
  })

  test("does not write either transcript or status for an unchanged poll", async () => {
    const { poller, store } = setup()
    await vi.advanceTimersByTimeAsync(0)
    const write = vi.spyOn(store, "setState")
    await poller.tick()
    expect(write).not.toHaveBeenCalled()
  })

  test("does not start overlapping reads and resumes after hiding an in-flight tick", async () => {
    const { poller, messages } = setup()
    await vi.advanceTimersByTimeAsync(0)
    let resolve: ((value: { data: SessionMessageRecord[] }) => void) | undefined
    messages.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const pending = poller.tick()
    await vi.advanceTimersByTimeAsync(0)
    await poller.tick()
    expect(messages).toHaveBeenCalledTimes(2)
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    document.dispatchEvent(new Event("visibilitychange"))
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    resolve!({ data: [] })
    await pending
    await vi.advanceTimersByTimeAsync(0)
    expect(messages).toHaveBeenCalledTimes(3)
  })

  test("disposal prevents an in-flight response from publishing", async () => {
    const { poller, store, messages } = setup()
    await vi.advanceTimersByTimeAsync(0)
    let resolve: ((value: { data: SessionMessageRecord[] }) => void) | undefined
    messages.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const pending = poller.tick()
    await vi.advanceTimersByTimeAsync(0)
    poller.dispose()
    const write = vi.spyOn(store, "setState")
    resolve!({ data: [{ info: assistant, parts: [] }] })
    await pending
    expect(write).not.toHaveBeenCalled()
    expect(store.getState().message.session).toEqual([user])
  })
})
