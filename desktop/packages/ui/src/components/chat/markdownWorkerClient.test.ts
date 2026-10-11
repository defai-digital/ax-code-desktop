import { afterEach, describe, expect, test, vi } from "vitest"
import { MarkdownWorkerClient, type MarkdownWorker } from "./markdownWorkerClient"
import type { MarkdownParseRequest } from "./markdownWorkerProtocol"

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
  const request = (owner: object, text: string, callback = vi.fn()) => {
    client.request(owner, { text, baseKey: "test", live: true }, callback)
    return callback
  }
  const respond = () => {
    const message = (worker.postMessage as ReturnType<typeof vi.fn>).mock.lastCall?.[0] as MarkdownParseRequest
    worker.onmessage?.call(worker as Worker, { data: { id: message.id, blocks: [] } } as MessageEvent)
  }
  return { worker, create, client, request, respond }
}

afterEach(() => vi.useRealTimers())

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

  test("times out a hung parse, terminates it, and settles queued consumers", () => {
    vi.useFakeTimers()
    const f = fixture()
    const active = f.request({}, "active")
    const queued = f.request({}, "queued")
    vi.advanceTimersByTime(5000)
    expect(active).toHaveBeenCalledWith(null)
    expect(queued).toHaveBeenCalledWith(null)
    expect(f.worker.terminate).toHaveBeenCalledTimes(1)
    const next = f.request({}, "next")
    expect(next).toHaveBeenCalledWith(null)
    expect(f.create).toHaveBeenCalledTimes(1)
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

  test("bounds individual payloads, pending bytes and pending consumer count", () => {
    const f = fixture()
    expect(f.request({}, "x".repeat(1_000_001))).toHaveBeenCalledWith(null)
    const owner = {}
    f.request(owner, "running")
    for (let index = 0; index < 4; index++) f.request({}, "x".repeat(1_000_000))
    expect(f.request({}, "overflow")).toHaveBeenCalledWith(null)
    f.worker.onerror?.call(f.worker as Worker, new ErrorEvent("error"))
    const g = fixture()
    g.request({}, "running")
    for (let index = 0; index < 16; index++) g.request({}, "pending")
    expect(g.request({}, "overflow")).toHaveBeenCalledWith(null)
    g.worker.onerror?.call(g.worker as Worker, new ErrorEvent("error"))
  })
})
