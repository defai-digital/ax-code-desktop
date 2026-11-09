import { parseDiffFromFile } from "@pierre/diffs"
import { afterEach, describe, expect, test, vi } from "vitest"

import { DiffParseClient, DiffParseError, MAX_PENDING_CHARACTERS, PARSE_TIMEOUT_MS, type DiffParseWorker } from "./diffParseClient"
import type { DiffParseRequest } from "./diffParseProtocol"

class FakeWorker implements DiffParseWorker {
  posted: DiffParseRequest[] = []
  terminated = false
  onmessage: DiffParseWorker["onmessage"] = null
  onerror: DiffParseWorker["onerror"] = null
  onmessageerror: DiffParseWorker["onmessageerror"] = null

  postMessage(message: unknown) {
    this.posted.push(message as DiffParseRequest)
  }

  terminate() {
    this.terminated = true
  }

  /** Runs the real parse for a posted request, as the Worker script does. */
  answer(index = this.posted.length - 1) {
    const request = this.posted[index]
    const diff = parseDiffFromFile(
      { name: request.name, contents: request.original },
      { name: request.name, contents: request.modified },
    )
    this.reply({ id: request.id, diff })
  }

  reply(data: unknown) {
    this.onmessage?.call(this as unknown as Worker, { data } as MessageEvent)
  }

  crash() {
    this.onerror?.call(this as unknown as Worker, new Event("error") as ErrorEvent)
  }
}

function setup() {
  const workers: FakeWorker[] = []
  const parseSync = vi.fn((name: string, original: string, modified: string) =>
    parseDiffFromFile({ name, contents: original }, { name, contents: modified }),
  )
  const client = new DiffParseClient(() => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  }, parseSync)
  return { client, workers, parseSync }
}

const before = "a\nb\nc\n"
const after = "a\nB\nc\n"

afterEach(() => {
  vi.useRealTimers()
})

describe("DiffParseClient", () => {
  test("parses in the Worker and returns the same metadata as a direct parse", async () => {
    const { client, workers, parseSync } = setup()
    const pending = client.parse("k", "f.ts", before, after)
    workers[0].answer()
    const diff = await pending
    expect(diff).toEqual(parseDiffFromFile({ name: "f.ts", contents: before }, { name: "f.ts", contents: after }))
    expect(parseSync).not.toHaveBeenCalled()
  })

  test("concurrent requests for one key share a single Worker job", async () => {
    const { client, workers } = setup()
    const first = client.parse("k", "f.ts", before, after)
    const second = client.parse("k", "f.ts", before, after)
    expect(workers[0].posted).toHaveLength(1)
    workers[0].answer()
    expect(await first).toBe(await second)
  })

  test("runs one job at a time in request order", async () => {
    const { client, workers } = setup()
    const first = client.parse("one", "f.ts", before, after)
    const second = client.parse("two", "f.ts", after, before)
    expect(workers[0].posted.map((request) => request.original)).toEqual([before])
    workers[0].answer()
    await first
    expect(workers[0].posted.map((request) => request.original)).toEqual([before, after])
    workers[0].answer()
    await second
  })

  test("aborting a queued request drops it before it reaches the Worker", async () => {
    const { client, workers } = setup()
    const running = client.parse("one", "f.ts", before, after)
    const controller = new AbortController()
    const queued = client.parse("two", "f.ts", after, before, controller.signal)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ reason: "aborted" })
    workers[0].answer()
    await running
    expect(workers[0].posted).toHaveLength(1)
  })

  test("aborting the running request terminates the Worker; the next one starts a new Worker", async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const running = client.parse("one", "f.ts", before, after, controller.signal)
    const next = client.parse("two", "f.ts", after, before)
    controller.abort()
    await expect(running).rejects.toMatchObject({ reason: "aborted" })
    expect(workers[0].terminated).toBe(true)
    expect(workers).toHaveLength(2)
    expect(workers[1].posted[0].original).toBe(after)
    workers[1].answer()
    await expect(next).resolves.toBeTruthy()
  })

  test("a request still waited on keeps running when another waiter aborts", async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const leaving = client.parse("k", "f.ts", before, after, controller.signal)
    const staying = client.parse("k", "f.ts", before, after)
    controller.abort()
    await expect(leaving).rejects.toMatchObject({ reason: "aborted" })
    expect(workers[0].terminated).toBe(false)
    workers[0].answer()
    await expect(staying).resolves.toBeTruthy()
  })

  test("a parse that outlives the timeout fails as too large and stops the Worker", async () => {
    vi.useFakeTimers()
    const { client, workers } = setup()
    const pending = client.parse("k", "f.ts", before, after)
    const outcome = expect(pending).rejects.toMatchObject({ reason: "too-large" })
    vi.advanceTimersByTime(PARSE_TIMEOUT_MS)
    await outcome
    expect(workers[0].terminated).toBe(true)
  })

  test("a Worker crash fails the job, and repeated crashes fall back to this thread", async () => {
    const { client, workers, parseSync } = setup()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pending = client.parse(`k${attempt}`, "f.ts", before, after)
      workers[attempt].crash()
      await expect(pending).rejects.toMatchObject({ reason: "error" })
    }
    expect(client.usesThreadFallback).toBe(true)
    await expect(client.parse("k", "f.ts", before, after)).resolves.toBeTruthy()
    expect(parseSync).toHaveBeenCalledTimes(1)
    expect(workers).toHaveLength(3)
  })

  test("after falling back, queued parses run one per task and an aborted one is skipped", async () => {
    vi.useFakeTimers()
    const { client, workers, parseSync } = setup()
    const crashing: Promise<unknown>[] = []
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const pending = client.parse(`c${attempt}`, "f.ts", before, after)
      workers[attempt].crash()
      crashing.push(pending.catch(() => undefined))
    }
    const last = client.parse("c2", "f.ts", before, after).catch(() => undefined)
    const controller = new AbortController()
    const first = client.parse("q1", "f.ts", before, after)
    const skipped = client.parse("q2", "f.ts", after, before, controller.signal)
    const third = client.parse("q3", "f.ts", after, after + "x\n")
    workers[2].crash()
    await Promise.all([...crashing, last])
    expect(client.usesThreadFallback).toBe(true)
    // Nothing ran synchronously inside the crash handler.
    expect(parseSync).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    expect(parseSync).toHaveBeenCalledTimes(1)
    await expect(first).resolves.toBeTruthy()
    controller.abort()
    await expect(skipped).rejects.toMatchObject({ reason: "aborted" })
    await vi.runOnlyPendingTimersAsync()
    await expect(third).resolves.toBeTruthy()
    expect(parseSync).toHaveBeenCalledTimes(2)
  })

  test("a successful parse resets the crash count", async () => {
    const { client, workers } = setup()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const pending = client.parse(`k${attempt}`, "f.ts", before, after)
      workers[attempt].crash()
      await expect(pending).rejects.toBeInstanceOf(DiffParseError)
    }
    const ok = client.parse("ok", "f.ts", before, after)
    workers[2].answer()
    await ok
    const again = client.parse("again", "f.ts", before, after)
    workers[2].crash()
    await expect(again).rejects.toMatchObject({ reason: "error" })
    expect(client.usesThreadFallback).toBe(false)
  })

  test("a malformed or mismatched response is a failure, not an empty diff", async () => {
    const { client, workers } = setup()
    const pending = client.parse("k", "f.ts", before, after)
    workers[0].reply({ id: workers[0].posted[0].id + 1, diff: { hunks: [] } })
    await expect(pending).rejects.toMatchObject({ reason: "error" })
    expect(workers[0].terminated).toBe(true)
  })

  test("without a usable Worker, parses on this thread", async () => {
    const parseSync = vi.fn((name: string, original: string, modified: string) =>
      parseDiffFromFile({ name, contents: original }, { name, contents: modified }),
    )
    const client = new DiffParseClient(() => {
      throw new Error("Worker is unavailable")
    }, parseSync)
    await expect(client.parse("k", "f.ts", before, after)).resolves.toBeTruthy()
    expect(parseSync).toHaveBeenCalledTimes(1)
  })

  test("rejects new work as busy once pending input exceeds the bound", async () => {
    const { client, workers } = setup()
    const half = "x".repeat(MAX_PENDING_CHARACTERS / 2)
    const running = client.parse("big", "f.ts", half, half)
    await expect(client.parse("more", "f.ts", before, after)).rejects.toMatchObject({ reason: "busy" })
    workers[0].reply({ id: workers[0].posted[0].id, diff: { hunks: [] } })
    await running
    // The bound is released once the job settles.
    const later = client.parse("more", "f.ts", before, after)
    workers[0].answer()
    await expect(later).resolves.toBeTruthy()
  })
})
