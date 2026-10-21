import React, { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { createRemoteActivityCache } from "@/lib/supervision/remoteActivityCache"
import type { ActivityMessageRecord, FetchActivityPage } from "@/lib/supervision/remoteActivityPreview"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useRemoteActivityPreviews } from "./useRemoteActivityPreviews"

const sdk = vi.hoisted(() => ({ messages: vi.fn(), scoped: vi.fn() }))
vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: { getScopedSdkClient: sdk.scoped },
}))

const row = (sessionId: string, updatedAt = 1): SupervisionRow => ({
  sessionId,
  updatedAt,
  directory: "/repo",
  title: sessionId,
  state: "running",
  treeSessionIds: [sessionId],
  projectId: null,
  projectLabel: null,
  evidence: null,
  goal: null,
})
const page = (text: string): ActivityMessageRecord[] => [
  { info: { id: "a", role: "assistant" }, parts: [{ type: "text", text }] },
]
const flush = () =>
  act(async () => {
    await Promise.resolve()
  })

function setup() {
  type Result = Awaited<ReturnType<FetchActivityPage>>
  const requests: Array<{
    input: Parameters<FetchActivityPage>[0]
    resolve: (result: Result) => void
    reject: (error: Error) => void
  }> = []
  const fetchPage = vi.fn<FetchActivityPage>(
    (input) =>
      new Promise((resolve, reject) => {
        requests.push({ input, resolve, reject })
      }),
  )
  const cache = createRemoteActivityCache(fetchPage, { minRefetchMs: 0 })
  let latest: ReadonlyMap<string, SupervisionRow> = new Map()
  function Harness({ rows }: { rows: SupervisionRow[] }) {
    latest = useRemoteActivityPreviews(rows, cache)
    return (
      <>
        {[...latest.values()].map((item) => (
          <span key={item.sessionId}>{item.activity?.text}</span>
        ))}
      </>
    )
  }
  return { requests, fetchPage, cache, Harness, latest: () => latest }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("useRemoteActivityPreviews", () => {
  test("caps shared concurrency at two, drains visible roots, and uses limit six", async () => {
    const { Harness, requests, latest } = setup()
    const rows = [row("a"), row("b"), row("c"), row("d")]
    render(
      <>
        <Harness rows={rows} />
        <Harness rows={rows} />
      </>,
    )
    expect(requests).toHaveLength(2)
    expect(requests.map((request) => request.input)).toEqual([
      { sessionID: "a", directory: "/repo", limit: 6 },
      { sessionID: "b", directory: "/repo", limit: 6 },
    ])
    await act(async () => {
      requests[1].resolve({ data: page("B") })
    })
    expect(requests).toHaveLength(3)
    expect(requests[2].input.sessionID).toBe("c")
    await act(async () => {
      requests[0].resolve({ data: page("A") })
    })
    expect(requests).toHaveLength(4)
    await act(async () => {
      requests[2].resolve({ data: page("C") })
      requests[3].resolve({ data: page("D") })
    })
    expect([...latest().values()].map((item) => item.activity?.text)).toEqual(["A", "B", "C", "D"])
    expect(requests).toHaveLength(4)
  })

  test("refetches only on revision growth and keeps the old preview until replacement", async () => {
    const { Harness, requests, cache, latest } = setup()
    const view = render(<Harness rows={[row("a", 10)]} />)
    await act(async () => {
      requests[0].resolve({ data: page("old") })
    })
    expect(cache.getSnapshot().get("a")).toMatchObject({ updatedAt: 10, fetchedAt: expect.any(Number) })
    view.rerender(<Harness rows={[row("a", 10)]} />)
    view.rerender(<Harness rows={[row("a", 9)]} />)
    expect(requests).toHaveLength(1)
    view.rerender(<Harness rows={[row("a", 11)]} />)
    expect(requests).toHaveLength(2)
    expect(latest().get("a")?.activity?.text).toBe("old")
    await act(async () => {
      requests[1].resolve({ data: page("new") })
    })
    expect(latest().get("a")?.activity?.text).toBe("new")
    cleanup()
    render(<Harness rows={[row("a", 11)]} />)
    expect(requests).toHaveLength(2)
  })

  test("coalesces growth during an in-flight read without parallel reads of the same session", async () => {
    const { Harness, requests, latest } = setup()
    const view = render(<Harness rows={[row("a", 1)]} />)
    view.rerender(<Harness rows={[row("a", 2)]} />)
    view.rerender(<Harness rows={[row("a", 3)]} />)
    expect(requests).toHaveLength(1)
    await act(async () => {
      requests[0].resolve({ data: page("first") })
    })
    expect(requests).toHaveLength(2)
    expect(latest().get("a")?.activity?.text).toBe("first")
    await act(async () => {
      requests[1].resolve({ data: page("latest") })
    })
    view.rerender(<Harness rows={[row("a", 3)]} />)
    expect(requests).toHaveLength(2)
  })

  test("in-memory text and todos win, including while a remote read is pending", async () => {
    const { Harness, requests, latest } = setup()
    const live = { ...row("live"), activity: { kind: "message" as const, text: "live text" } }
    const view = render(<Harness rows={[row("a"), live]} />)
    expect(requests).toHaveLength(1)
    const todo = { ...row("a"), activity: { kind: "todo" as const, text: "Working on: tests" } }
    view.rerender(<Harness rows={[todo, live]} />)
    await act(async () => {
      requests[0].resolve({ data: page("remote text") })
    })
    expect(latest().get("a")).toBe(todo)
    expect(latest().get("live")).toBe(live)
    view.rerender(<Harness rows={[row("a"), live]} />)
    expect(latest().get("a")?.activity?.text).toBe("remote text")
    expect(requests).toHaveLength(1)
  })

  test("does not hammer SDK failures or thrown errors, and preserves a previous preview", async () => {
    const { Harness, requests, cache, latest } = setup()
    const view = render(<Harness rows={[row("a")]} />)
    await act(async () => {
      requests[0].resolve({ data: page("previous") })
    })
    view.rerender(<Harness rows={[row("a", 2)]} />)
    await act(async () => {
      requests[1].resolve({ error: "token=abcdefghijk12345" })
    })
    view.rerender(<Harness rows={[row("a", 2)]} />)
    expect(requests).toHaveLength(2)
    expect(latest().get("a")?.activity?.text).toBe("previous")
    view.rerender(<Harness rows={[row("a", 3)]} />)
    await act(async () => {
      requests[2].reject(new Error("password=abcdefghijk12345"))
    })
    view.rerender(<Harness rows={[row("a", 3)]} />)
    cleanup()
    render(<Harness rows={[row("a", 3)]} />)
    expect(requests).toHaveLength(3)
    expect(cache.getSnapshot().get("a")).toEqual({
      preview: { kind: "message", text: "previous" },
      updatedAt: 3,
      fetchedAt: expect.any(Number),
      directory: "/repo",
    })
  })

  test("unmount stops queued work and remount reuses completed reads", async () => {
    const { Harness, requests } = setup()
    const rows = [row("a"), row("b"), row("c")]
    render(
      <React.StrictMode>
        <Harness rows={rows} />
      </React.StrictMode>,
    )
    expect(requests).toHaveLength(2)
    cleanup()
    await act(async () => {
      requests[0].resolve({ data: [] })
      requests[1].resolve({ data: [] })
    })
    expect(requests).toHaveLength(2)
    render(<Harness rows={rows} />)
    expect(requests).toHaveLength(3)
    expect(requests[2].input.sessionID).toBe("c")
  })

  test("drops hidden queued rows and skips rows without a known directory", async () => {
    const { Harness, requests } = setup()
    const view = render(<Harness rows={[row("a"), row("b"), row("hidden"), { ...row("unknown"), directory: null }]} />)
    view.rerender(<Harness rows={[row("b"), { ...row("unknown"), directory: null }]} />)
    await act(async () => {
      requests[0].resolve({ data: [] })
      requests[1].resolve({ data: [] })
    })
    expect(requests).toHaveLength(2)
  })

  test("bounds previews at 300 without cycling or retrying evicted failures on a large board", async () => {
    const fetchPage = vi.fn<FetchActivityPage>(async () => ({ error: "failed" }))
    const cache = createRemoteActivityCache(fetchPage)
    const consumer = cache.mount()
    const rows = Array.from({ length: 305 }, (_, index) => row(String(index)))
    consumer.update(rows)
    await flush()
    expect(fetchPage).toHaveBeenCalledTimes(305)
    expect(cache.getSnapshot().size).toBe(300)
    expect(cache.getSnapshot().has("0")).toBe(false)
    consumer.update(rows.map((item) => ({ ...item })))
    await flush()
    expect(fetchPage).toHaveBeenCalledTimes(305)
    consumer.dispose()
  })

  test("uses the directory-scoped SDK directly for the production hook", async () => {
    sdk.messages.mockResolvedValue({ data: page("SDK preview") })
    sdk.scoped.mockReturnValue({ session: { messages: sdk.messages } })
    function Board() {
      const rows = React.useMemo(() => [row("sdk-session")], [])
      const enriched = useRemoteActivityPreviews(rows)
      return <span>{enriched.get("sdk-session")?.activity?.text}</span>
    }
    const view = render(<Board />)
    await flush()
    expect(sdk.scoped).toHaveBeenCalledWith("/repo")
    expect(sdk.messages).toHaveBeenCalledWith({ sessionID: "sdk-session", directory: "/repo", limit: 6 })
    expect(view.container.textContent).toBe("SDK preview")
  })

  test("a read that never settles frees its slot, so other rows still get previews", async () => {
    vi.useFakeTimers()
    try {
      const fetchPage = vi.fn<FetchActivityPage>((input) =>
        input.sessionID === "c" ? Promise.resolve({ data: page("C") }) : new Promise(() => {}),
      )
      const cache = createRemoteActivityCache(fetchPage, { timeoutMs: 1000 })
      const consumer = cache.mount()
      consumer.update([row("a"), row("b"), row("c")])
      expect(fetchPage).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(1000)
      expect(fetchPage).toHaveBeenCalledTimes(3)
      expect(cache.getSnapshot().get("c")?.preview?.text).toBe("C")
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("reads a busy session at most once per interval and catches up after it", async () => {
    vi.useFakeTimers()
    try {
      let clock = 0
      let reads = 0
      const fetchPage = vi.fn<FetchActivityPage>(async () => ({ data: page(`read ${++reads}`) }))
      const cache = createRemoteActivityCache(fetchPage, { minRefetchMs: 5000, now: () => clock })
      const consumer = cache.mount()
      consumer.update([row("a", 1)])
      await flush()
      consumer.update([row("a", 2)])
      consumer.update([row("a", 3)])
      await flush()
      expect(fetchPage).toHaveBeenCalledTimes(1)
      clock = 5000
      await vi.advanceTimersByTimeAsync(5000)
      expect(fetchPage).toHaveBeenCalledTimes(2)
      expect(cache.getSnapshot().get("a")).toMatchObject({ updatedAt: 3, preview: { text: "read 2" } })
      consumer.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  test("a session that moved to another directory is read again and never shows the old directory's preview", async () => {
    const { Harness, requests, latest } = setup()
    const view = render(<Harness rows={[row("a", 5)]} />)
    await act(async () => {
      requests[0].resolve({ data: page("old place") })
    })
    view.rerender(<Harness rows={[{ ...row("a", 5), directory: "/elsewhere" }]} />)
    expect(latest().get("a")?.activity ?? null).toBeNull()
    expect(requests[1]?.input.directory).toBe("/elsewhere")
  })

  test("eviction drops previews no board shows before the ones on screen", async () => {
    const fetchPage = vi.fn<FetchActivityPage>(async (input) => ({ data: page(input.sessionID) }))
    const cache = createRemoteActivityCache(fetchPage)
    const offscreen = cache.mount()
    offscreen.update(Array.from({ length: 300 }, (_, index) => row(`old-${index}`)))
    await flush()
    offscreen.dispose()
    const board = cache.mount()
    board.update([row("visible")])
    await flush()
    const keys = [...cache.getSnapshot().keys()]
    expect(keys).toHaveLength(300)
    expect(keys).toContain("visible")
    expect(keys).not.toContain("old-0")
    board.dispose()
  })

  test("a move during an outstanding read is read again, and a failed read after a move shows no old-directory text", async () => {
    const { Harness, requests, latest } = setup()
    const view = render(<Harness rows={[row("a", 5)]} />)
    view.rerender(<Harness rows={[{ ...row("a", 5), directory: "/elsewhere" }]} />)
    await act(async () => {
      requests[0].resolve({ data: page("old place") })
    })
    expect(requests[1]?.input.directory).toBe("/elsewhere")
    await act(async () => {
      requests[1].resolve({ error: "failed" })
    })
    expect(latest().get("a")?.activity ?? null).toBeNull()
  })
})
