import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { AxCodeClient, Message, Part, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { ChildStoreManager } from "./child-store"
import { PartMap } from "./part-map"
import { clearSessionLoadState, getPendingSessionLoadIds } from "./session-load-cache"

let manager = new ChildStoreManager()
let store = manager.ensureChild("/repo", { bootstrap: false })
let messagesResponse: { data: Array<{ info: Message; parts: Part[] }>; response: Response }
const messagesMock = vi.fn<(input: unknown) => Promise<typeof messagesResponse>>(async () => messagesResponse)
const getMock = vi.fn(async () => ({ data: { id: "ses", time: { created: 1, updated: 1 } } as Session }))
const sdk = { session: { get: getMock, messages: messagesMock } } as unknown as AxCodeClient

vi.mock("./sync-context", () => ({
  useSyncSDK: () => sdk,
  useSyncDirectory: () => "/repo",
  useDirectoryChildStore: () => store,
  useChildStoreManager: () => manager,
}))
const { useSync } = await import("./use-sync")
let root: Root
let container: HTMLDivElement
function renderSyncHook() {
  let current!: ReturnType<typeof useSync>
  function Probe() {
    current = useSync()
    return null
  }
  act(() => root.render(<Probe />))
  return {
    result: {
      get current() {
        return current
      },
    },
  }
}
const info = (i: number): Message =>
  ({
    id: `msg_${String(i).padStart(6, "0")}`,
    sessionID: "ses",
    role: "assistant",
    time: { created: i, completed: i + 1 },
  }) as Message
const record = (i: number) => ({
  info: info(i),
  parts: [
    {
      id: `prt_${i}`,
      messageID: info(i).id,
      sessionID: "ses",
      type: "text",
      text: `message ${i}`,
    },
  ] as Part[],
})

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  manager = new ChildStoreManager()
  store = manager.ensureChild("/repo", { bootstrap: false })
  messagesResponse = { data: [record(1000)], response: new Response("", { headers: { "x-next-cursor": "older" } }) }
  messagesMock.mockReset().mockImplementation(async () => messagesResponse)
  getMock.mockClear()
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  manager.disposeAll()
  vi.useRealTimers()
})

test("reopens trimmed history through a real fetch and can page older messages again", async () => {
  const records = Array.from({ length: 1000 }, (_, i) => record(i))
  store.setState({
    message: { ses: records.map((r) => r.info) },
    part: PartMap.from(records.map((r) => [r.info.id, r.parts])),
  })
  manager.sweepRetention()
  expect(store.getState().message.ses).toHaveLength(150)
  manager.configure({ getViewedSessions: () => new Set(["ses"]) })
  const { result } = renderSyncHook()
  await act(async () => {
    await result.current.syncSession("ses")
  })
  expect(messagesMock).toHaveBeenCalledTimes(1)
  expect(result.current.hasMore("ses")).toBe(true)
  expect(getPendingSessionLoadIds("/repo").size).toBe(0)
  messagesResponse = { data: [record(0)], response: new Response("") }
  await act(async () => {
    await result.current.loadMore("ses")
  })
  expect(messagesMock).toHaveBeenLastCalledWith(expect.objectContaining({ sessionID: "ses", before: "older" }))
  expect(store.getState().message.ses.some((item) => item.id === info(0).id)).toBe(true)
})

test("discarded load ownership prevents a late response from restoring content or prefetch", async () => {
  let finish!: (value: typeof messagesResponse) => void
  messagesMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { result } = renderSyncHook()
  let pending!: Promise<void>
  act(() => {
    pending = result.current.syncSession("ses")
  })
  clearSessionLoadState("/repo", ["ses"])
  await act(async () => {
    finish(messagesResponse)
    await pending
  })
  expect(store.getState().message.ses).toBeUndefined()
  expect(getPendingSessionLoadIds("/repo").size).toBe(0)
})

test("disposed directories do not receive late fetches into their detached store", async () => {
  let finish!: (value: typeof messagesResponse) => void
  messagesMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { result } = renderSyncHook()
  let pending!: Promise<void>
  act(() => {
    pending = result.current.syncSession("ses")
  })
  const detached = store
  manager.disposeAll()
  await act(async () => {
    finish(messagesResponse)
    await pending
  })
  expect(detached.getState().message.ses).toBeUndefined()
  expect(getPendingSessionLoadIds("/repo").size).toBe(0)
})
