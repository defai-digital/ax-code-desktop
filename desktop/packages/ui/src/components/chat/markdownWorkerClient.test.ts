import { afterEach, describe, expect, test, vi } from "vitest"
import { MarkdownWorkerClient, type MarkdownWorker } from "./markdownWorkerClient"
import type { MarkdownParseRequest } from "./markdownWorkerProtocol"

const cleanups: Array<() => void> = []
const fixture = () => {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  } as MarkdownWorker
  const create = vi.fn(() => worker)
  const client = new MarkdownWorkerClient(create)
  const owners = new Set<object>()
  cleanups.push(() => {
    for (const owner of owners) client.release(owner)
  })
  const request = (owner: object, text: string, callback = vi.fn()) => {
    owners.add(owner)
    client.request(owner, { text, baseKey: "test", live: true }, callback)
    return callback
  }
  const respond = () => {
    const message = (worker.postMessage as ReturnType<typeof vi.fn>).mock.lastCall?.[0] as MarkdownParseRequest
    worker.onmessage?.call(worker as Worker, { data: { id: message.id, blocks: [] } } as MessageEvent)
  }
  return { worker, create, client, request, respond }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.useRealTimers()
})

describe("Markdown worker scheduling", () => {
  test("starts lazily and coalesces a burst to the latest pending version", () => {
    const f = fixture()
    expect(f.create).not.toHaveBeenCalled()
    const owner = {}
    const first = f.request(owner, "first")
    const superseded = f.request(owner, "second")
    const latest = f.request(owner, "third")
    expect(f.worker.postMessage).toHaveBeenCalledTimes(1)
    f.respond()
    expect(first).toHaveBeenCalledWith([])
    expect(f.worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ text: "third" }))
    f.respond()
    expect(latest).toHaveBeenCalledWith([])
    expect(superseded).not.toHaveBeenCalled()
    f.client.release(owner)
    expect(f.worker.terminate).toHaveBeenCalledTimes(1)
  })

  test("releasing a consumer suppresses its result without cancelling another consumer", () => {
    const f = fixture()
    const owner = {}
    const first = f.request(owner, "first")
    const otherOwner = {}
    const other = f.request(otherOwner, "other")
    f.client.release(owner)
    expect(f.worker.terminate).not.toHaveBeenCalled()
    f.respond()
    expect(first).not.toHaveBeenCalled()
    f.respond()
    expect(other).toHaveBeenCalledWith([])
    f.client.release(otherOwner)
  })

  test("times out only the hung job and restarts for queued consumers", () => {
    vi.useFakeTimers()
    const f = fixture()
    const active = f.request({}, "active")
    const queued = f.request({}, "queued")
    vi.advanceTimersByTime(5000)
    expect(active).toHaveBeenCalledWith(null)
    expect(queued).not.toHaveBeenCalled()
    expect(f.worker.terminate).toHaveBeenCalledTimes(1)
    expect(f.create).toHaveBeenCalledTimes(2)
    f.respond()
    expect(queued).toHaveBeenCalledWith([])
    const next = f.request({}, "next")
    f.respond()
    expect(next).toHaveBeenCalledWith([])
  })

  test("terminates abandoned active work when the last pending owner unmounts", () => {
    vi.useFakeTimers()
    const f = fixture()
    const activeOwner = {}
    const pendingOwner = {}
    const active = f.request(activeOwner, "active")
    f.request(pendingOwner, "pending")
    f.client.release(activeOwner)
    expect(f.worker.terminate).not.toHaveBeenCalled()
    f.client.release(pendingOwner)
    expect(f.worker.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(active).not.toHaveBeenCalled()
  })

  test("handles worker construction and message failures without a synchronous parse", () => {
    const client = new MarkdownWorkerClient(() => {
      throw new Error("No worker")
    })
    const result = vi.fn()
    client.request({}, { text: "test", baseKey: "test", live: false }, result)
    expect(result).toHaveBeenCalledWith(null)
    const f = fixture()
    const active = f.request({}, "active")
    f.worker.onmessageerror?.call(f.worker as Worker, new MessageEvent("messageerror"))
    expect(active).toHaveBeenCalledWith(null)
    expect(f.worker.terminate).toHaveBeenCalled()
  })

  test("ignores late messages and errors from a terminated worker generation", () => {
    const workers: MarkdownWorker[] = []
    const client = new MarkdownWorkerClient(() => {
      const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null }
      workers.push(worker)
      return worker
    })
    const firstOwner = {}
    const secondOwner = {}
    const first = vi.fn()
    const second = vi.fn()
    client.request(firstOwner, { text: "first", live: true, baseKey: "test" }, first)
    client.request(secondOwner, { text: "second", live: true, baseKey: "test" }, second)
    const old = workers[0]
    old.onerror?.call(old as Worker, new ErrorEvent("error"))
    const current = workers[1]
    const request = (current.postMessage as ReturnType<typeof vi.fn>).mock.lastCall![0] as MarkdownParseRequest
    old.onmessage?.call(old as Worker, { data: { id: request.id, blocks: [] } } as MessageEvent)
    old.onerror?.call(old as Worker, new ErrorEvent("error"))
    expect(second).not.toHaveBeenCalled()
    expect(current.terminate).not.toHaveBeenCalled()
    current.onmessage?.call(current as Worker, { data: { id: request.id, blocks: [] } } as MessageEvent)
    expect(first).toHaveBeenCalledExactlyOnceWith(null)
    expect(second).toHaveBeenCalledExactlyOnceWith([])
    client.release(firstOwner)
    client.release(secondOwner)
  })

  test("bounds individual payloads, pending bytes and pending consumer count", () => {
    const f = fixture()
    expect(f.request({}, "x".repeat(1_000_001))).toHaveBeenCalledWith(null)
    const owner = {}
    f.request(owner, "running")
    for (let index = 0; index < 3; index++) f.request({}, "x".repeat(1_000_000))
    f.request({}, "x".repeat(1_000_000 - "running".length))
    expect(f.request({}, "overflow")).toHaveBeenCalledWith(null)
    f.worker.onerror?.call(f.worker as Worker, new ErrorEvent("error"))
    const g = fixture()
    g.request({}, "running")
    for (let index = 0; index < 16; index++) g.request({}, "pending")
    expect(g.request({}, "overflow")).toHaveBeenCalledWith(null)
    g.worker.onerror?.call(g.worker as Worker, new ErrorEvent("error"))
  })

  test("rehydrates an acknowledged suffix without cloning stable block objects again", () => {
    const f = fixture()
    const owner = {}
    const first = f.request(owner, "first")
    const request = (f.worker.postMessage as ReturnType<typeof vi.fn>).mock.lastCall![0] as MarkdownParseRequest
    const stable = { key: "stable", mode: "full", raw: "header", src: "header", tree: { type: "root", children: [] } }
    const respond = (data: unknown) => f.worker.onmessage?.call(f.worker as Worker, { data } as MessageEvent)
    respond({ id: request.id, blocks: [stable] })
    expect(first.mock.calls[0][0][0]).toBe(stable)
    const second = f.request(owner, "first tail")
    const next = (f.worker.postMessage as ReturnType<typeof vi.fn>).mock.lastCall![0] as MarkdownParseRequest
    expect(next.baseRevision).toBe(request.id)
    respond({ id: next.id, baseRevision: request.id, stablePrefixCount: 1, blocks: [] })
    expect(second.mock.calls[0][0][0]).toBe(stable)
  })

  test("rejects a suffix based on an unacknowledged revision and recovers", () => {
    const f = fixture()
    const bad = f.request({}, "bad protocol")
    const request = (f.worker.postMessage as ReturnType<typeof vi.fn>).mock.lastCall![0] as MarkdownParseRequest
    f.worker.onmessage?.call(
      f.worker as Worker,
      {
        data: { id: request.id, baseRevision: -1, stablePrefixCount: 1, blocks: [] },
      } as MessageEvent,
    )
    expect(bad).toHaveBeenCalledWith(null)
    const next = f.request({}, "healthy")
    f.respond()
    expect(next).toHaveBeenCalledWith([])
  })

  test("opens a bounded cooldown after repeated faults, then permits one recovery probe", async () => {
    vi.useFakeTimers()
    const f = fixture()
    for (let i = 0; i < 3; i++) {
      f.request({}, "fault")
      f.worker.onerror?.call(f.worker as Worker, new ErrorEvent("error"))
    }
    const listener = vi.fn()
    const unsubscribe = f.client.subscribeCapacity(listener)
    const owner = {}
    const result = vi.fn()
    expect(f.client.request(owner, { text: "deferred", live: true, baseKey: "test" }, result)).toBe("deferred")
    expect(f.create).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(listener).toHaveBeenCalled()
    const recovered = f.request(owner, "deferred")
    f.respond()
    expect(recovered).toHaveBeenCalledWith([])
    expect(f.create).toHaveBeenCalledTimes(4)
    unsubscribe()
  })

  test("notifies deferred consumers after queue capacity becomes available", async () => {
    const f = fixture()
    f.request({}, "active")
    for (let i = 0; i < 16; i++) f.request({}, "pending")
    const owner = {}
    const callback = vi.fn()
    expect(f.client.request(owner, { text: "later", live: false, baseKey: "test" }, callback)).toBe("deferred")
    const listener = vi.fn()
    const unsubscribe = f.client.subscribeCapacity(listener)
    f.respond()
    await Promise.resolve()
    expect(listener).toHaveBeenCalledOnce()
    expect(f.client.request(owner, { text: "later", live: false, baseKey: "test" }, callback)).toBe("queued")
    f.client.release(owner)
    unsubscribe()
  })
})
