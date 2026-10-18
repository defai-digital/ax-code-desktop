import { describe, expect, test, vi } from "vitest"
import { renderMermaidASCII, renderMermaidSVG } from "beautiful-mermaid"
import { createMermaidRenderer } from "./mermaidRenderer"
import {
  getMermaidCapability,
  mermaidCapabilities,
  type MermaidRequest,
  type MermaidWorkerRequest,
  type MermaidWorkerResponse,
} from "./mermaidProtocol"
import { mermaidFixtures } from "./mermaid.fixtures"
import uiPackage from "../../../package.json"

const request = (source = mermaidFixtures.flowchart): MermaidRequest => ({
  source,
  mode: "svg",
  colors: { bg: "#fff", fg: "#111" },
  dark: false,
})
const signal = () => new AbortController().signal

class FakeWorker {
  onmessage: ((event: MessageEvent<MermaidWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn((job: MermaidWorkerRequest) => {
    queueMicrotask(() => this.reply(job.id, '<svg viewBox="0 0 10 10"><text>Ready</text></svg>'))
  })
  reply(id: number, output: string) {
    this.onmessage?.({ data: { id, output } } as MessageEvent<MermaidWorkerResponse>)
  }
}

describe("Mermaid capability contract", () => {
  test("keeps the verified fixture set and renderer pins aligned", () => {
    expect(mermaidCapabilities.types.map((item) => item.id).sort()).toEqual(Object.keys(mermaidFixtures).sort())
    for (const [name, version] of Object.entries(mermaidCapabilities.renderers)) {
      expect(uiPackage.dependencies[name as keyof typeof uiPackage.dependencies].replace(/^\^/, "")).toBe(version)
    }
  })
  test.each(Object.entries(mermaidFixtures))("routes %s and preserves ASCII limits", (type, source) => {
    const capability = getMermaidCapability(source, "svg")
    expect(capability.id).toBe(type)
    if (capability.ascii) {
      expect(renderMermaidSVG(source)).toContain("<svg")
      expect(renderMermaidASCII(source).trim().length).toBeGreaterThan(0)
    } else {
      expect(() => getMermaidCapability(source, "ascii")).toThrow(expect.objectContaining({ code: "asciiUnsupported" }))
    }
  })
  test("accepts comments and aliases but rejects unknown types, directives, and oversized input", () => {
    expect(getMermaidCapability("%% comment\n graph LR; A-->B", "svg").id).toBe("flowchart")
    for (const [source, code] of [
      ["unknownDiagram\nA", "unsupported"],
      ['%%{init: {"securityLevel":"loose"}}%%\npie\n"A":1', "configuration"],
      ["---\nconfig: {}\n---\npie", "configuration"],
      ["flowchart LR\n" + "a".repeat(20_000), "limit"],
      ["flowchart LR\n" + "\n".repeat(500), "limit"],
    ])
      expect(() => getMermaidCapability(source, "svg")).toThrow(expect.objectContaining({ code }))
  })
})

describe("Mermaid rendering lifecycle", () => {
  test("caches sanitized output by source, mode, and theme", async () => {
    const worker = new FakeWorker()
    worker.postMessage.mockImplementation(({ id }) =>
      queueMicrotask(() =>
        worker.reply(id, '<svg onload="alert(1)" viewBox="0 0 1 1"><script>bad()</script><text>Safe</text></svg>'),
      ),
    )
    const render = createMermaidRenderer({ createWorker: () => worker as unknown as Worker })
    const first = await render(request(), signal())
    expect(first).not.toMatch(/onload|script|bad\(/)
    expect(await render(request(), signal())).toBe(first)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    await render({ ...request(), dark: true }, signal())
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
  })
  test("serializes official jobs and recovers after a rejection", async () => {
    let release: (value: string) => void = () => {}
    const official = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            release = resolve
          }),
      )
      .mockRejectedValueOnce(new Error("invalid syntax"))
      .mockResolvedValue('<svg viewBox="0 0 1 1"/>')
    const render = createMermaidRenderer({ renderOfficial: official })
    const first = render(request(mermaidFixtures.pie), signal())
    const second = render(request(mermaidFixtures.gantt), signal()).catch((error: Error) => error)
    expect(official).toHaveBeenCalledTimes(1)
    release('<svg viewBox="0 0 1 1"/>')
    await first
    expect(await second).toBeInstanceOf(Error)
    await expect(render(request(mermaidFixtures.mindmap), signal())).resolves.toContain("<svg")
  })
  test("aborts active workers and skips cancelled queued jobs", async () => {
    const worker = new FakeWorker()
    worker.postMessage.mockImplementation(() => {})
    const render = createMermaidRenderer({ createWorker: () => worker as unknown as Worker })
    const active = new AbortController()
    const queued = new AbortController()
    const first = render(request(), active.signal).catch((error: Error) => error)
    const second = render(request("flowchart LR; X-->Y"), queued.signal).catch((error: Error) => error)
    queued.abort()
    active.abort()
    expect(await first).toMatchObject({ name: "AbortError" })
    expect(await second).toMatchObject({ name: "AbortError" })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
  })
  test("terminates timed-out work and creates a fresh worker for retry", async () => {
    const stalled = new FakeWorker()
    stalled.postMessage.mockImplementation(() => {})
    const working = new FakeWorker()
    const factory = vi.fn().mockReturnValueOnce(stalled).mockReturnValue(working)
    const render = createMermaidRenderer({ createWorker: factory, timeoutMs: 5 })
    await expect(render(request(), signal())).rejects.toMatchObject({ code: "timeout" })
    expect(stalled.terminate).toHaveBeenCalledOnce()
    await expect(render(request(), signal())).resolves.toContain("<svg")
  })
  test("does not fall back to synchronous UI layout when Worker is unavailable", async () => {
    const render = createMermaidRenderer({
      createWorker: () => {
        throw new Error("CSP denied")
      },
    })
    await expect(render(request(), signal())).rejects.toMatchObject({ code: "unavailable" })
  })
  test("bounds the cache and re-renders evicted entries", async () => {
    const worker = new FakeWorker()
    const render = createMermaidRenderer({ createWorker: () => worker as unknown as Worker })
    for (let i = 0; i < 34; i++) await render(request(`flowchart LR; N${i}-->B`), signal())
    await render(request("flowchart LR; N0-->B"), signal())
    expect(worker.postMessage).toHaveBeenCalledTimes(35)
  })

  test("discards a worker whose lazy renderer import failed and allows retry", async () => {
    const broken = new FakeWorker()
    broken.postMessage.mockImplementation(({ id }) => {
      queueMicrotask(() =>
        broken.onmessage?.({
          data: { id, error: "Failed to load module", errorCode: "unavailable" },
        } as MessageEvent<MermaidWorkerResponse>),
      )
    })
    const working = new FakeWorker()
    const render = createMermaidRenderer({ createWorker: vi.fn().mockReturnValueOnce(broken).mockReturnValue(working) })
    await expect(render(request(), signal())).rejects.toMatchObject({ code: "unavailable" })
    expect(broken.terminate).toHaveBeenCalledOnce()
    await expect(render(request(), signal())).resolves.toContain("<svg")
  })

  test("bounds pending work and frees the queue when its consumers cancel", async () => {
    const worker = new FakeWorker()
    worker.postMessage.mockImplementation(() => {})
    const render = createMermaidRenderer({ createWorker: () => worker as unknown as Worker })
    const controller = new AbortController()
    const jobs = Array.from({ length: 33 }, () => render(request(), controller.signal).catch((error: Error) => error))
    await expect(render(request(), signal())).rejects.toMatchObject({ code: "busy" })
    controller.abort()
    expect((await Promise.all(jobs)).every((error) => error instanceof Error && error.name === "AbortError")).toBe(true)
    worker.postMessage.mockImplementation(({ id }) =>
      queueMicrotask(() => worker.reply(id, '<svg viewBox="0 0 1 1"/>')),
    )
    await expect(render(request(), signal())).resolves.toContain("<svg")
  })
})
