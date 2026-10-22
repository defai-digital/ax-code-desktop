import { describe, expect, test, vi } from "vitest"
import { EventEmitter } from "node:events"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
const { NativeWebMcp, definitionDigest } = createRequire(import.meta.url)("./native-webmcp.js")

const fixtureTool = { name: "echo", description: "Echo fixture data", frameId: "top", inputSchema: { type: "object" } }
async function fixture() {
  const contents = new EventEmitter()
  contents.getURL = () => "https://example.com/"
  contents.debugger = new EventEmitter()
  let attached = false
  const commands = []
  contents.debugger.attach = () => {
    attached = true
  }
  contents.debugger.detach = () => {
    attached = false
  }
  contents.debugger.isAttached = () => attached
  contents.debugger.sendCommand = async (method, args) => {
    commands.push({ method, args })
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "top" } } }
    if (method === "WebMCP.invokeTool") return { invocationId: "native-call" }
    return {}
  }
  const adapter = new NativeWebMcp(contents)
  await adapter.start()
  const emit = (method, params) => contents.debugger.emit("message", {}, method, params)
  emit("WebMCP.toolsAdded", { tools: [fixtureTool] })
  const request = () => ({
    requestID: randomUUID(),
    generation: adapter.generation,
    origin: "https://example.com",
    frameId: "top",
    operation: "invoke",
    toolName: "echo",
    digest: definitionDigest(fixtureTool),
    input: {},
    deadline: Date.now() + 1000,
  })
  return { contents, adapter, commands, emit, request }
}

describe("native WebMCP adapter", () => {
  test.each(["Page.enable", "Page.getFrameTree", "WebMCP.enable"])("bounds stalled initialization at %s and ignores late completion", async (stalled) => {
    const contents = new EventEmitter()
    contents.debugger = new EventEmitter()
    contents.debugger.attach = vi.fn()
    contents.debugger.isAttached = () => true
    contents.debugger.detach = vi.fn()
    let complete
    contents.debugger.sendCommand = vi.fn(async (method) => {
      if (method === stalled) return new Promise((resolve) => { complete = resolve })
      return { frameTree: { frame: { id: "top" } } }
    })
    const adapter = new NativeWebMcp(contents)
    await expect(adapter.start({ timeoutMs: 20 })).rejects.toThrow(/does not provide native WebMCP/)
    const calls = contents.debugger.sendCommand.mock.calls.length
    complete({ frameTree: { frame: { id: "late" } } })
    await new Promise((resolve) => setImmediate(resolve))
    expect(adapter.available).toBe(false)
    expect(adapter.closed).toBe(true)
    expect(contents.debugger.sendCommand).toHaveBeenCalledTimes(calls)
    expect(contents.listenerCount("destroyed")).toBe(0)
    expect(contents.debugger.listenerCount("detach")).toBe(0)
  })

  test.each(["destroyed", "render-process-gone", "detach", "close"])("interrupts initialization immediately on %s", async (event) => {
    const contents = new EventEmitter()
    contents.debugger = new EventEmitter()
    contents.debugger.attach = vi.fn()
    contents.debugger.isAttached = () => true
    contents.debugger.detach = vi.fn()
    contents.debugger.sendCommand = () => new Promise(() => {})
    const adapter = new NativeWebMcp(contents)
    const starting = adapter.start({ timeoutMs: 10000 })
    const rejected = expect(starting).rejects.toThrow(/does not provide native WebMCP/)
    if (event === "close") adapter.close()
    else (event === "detach" ? contents.debugger : contents).emit(event)
    await rejected
    expect(adapter.available).toBe(false)
    expect(adapter.closed).toBe(true)
  })

  test("uses only the exact native guest and discovers top-level tools", async () => {
    const f = await fixture()
    f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, frameId: "other-frame", name: "hidden" }] })
    expect(f.adapter.snapshot().tools).toEqual([fixtureTool])
    expect(f.commands.map((call) => call.method)).toEqual(["Page.enable", "Page.getFrameTree", "WebMCP.enable"])
    f.adapter.close()
  })
  test("matches an actual native completion to its invocation and immutable document", async () => {
    const f = await fixture()
    const request = f.request()
    const pending = f.adapter.execute(request)
    await Promise.resolve()
    f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: { value: "ok" } })
    expect(await pending).toMatchObject({
      status: "Completed",
      output: { value: "ok" },
      generation: request.generation,
    })
    f.adapter.close()
  })
  test("same-URL reload revokes the old identity before native invocation", async () => {
    const f = await fixture()
    const old = f.request()
    f.contents.emit("did-start-navigation", {}, "https://example.com/", false, true)
    await expect(f.adapter.execute(old)).rejects.toThrow()
    expect(f.commands.some((call) => call.method === "WebMCP.invokeTool")).toBe(false)
    f.adapter.close()
  })
  test("revoking agent enrollment preserves manually loaded native tools", async () => {
    const f = await fixture()
    const generation = f.adapter.generation
    f.adapter.revoke()
    expect(f.adapter.generation).not.toBe(generation)
    expect(f.adapter.snapshot().tools).toEqual([fixtureTool])
    f.adapter.close()
  })
  test("rejects an obsolete definition before dispatch", async () => {
    const f = await fixture()
    const request = f.request()
    f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, description: "Replaced" }] })
    await expect(f.adapter.execute(request)).rejects.toMatchObject({ reason: "page-changed" })
    expect(f.commands.some(({ method }) => method === "WebMCP.invokeTool")).toBe(false)
    f.adapter.close()
  })
  test("cancel reaches CDP even when the native acknowledgement is late", async () => {
    const f = await fixture()
    let acknowledge
    const base = f.contents.debugger.sendCommand
    f.contents.debugger.sendCommand = (method, args) =>
      method === "WebMCP.invokeTool"
        ? new Promise((resolve) => {
            acknowledge = resolve
          })
        : base(method, args)
    const request = f.request()
    const pending = f.adapter.execute(request)
    const rejected = expect(pending).rejects.toThrow()
    f.adapter.cancel(request.requestID)
    acknowledge({ invocationId: "late-call" })
    await rejected
    await Promise.resolve()
    expect(f.commands).toContainEqual({ method: "WebMCP.cancelInvocation", args: { invocationId: "late-call" } })
    f.adapter.close()
  })
  test("rejects oversized native output and debugger detach without automatic retry", async () => {
    const f = await fixture()
    const request = f.request()
    const pending = f.adapter.execute(request)
    const rejected = expect(pending).rejects.toThrow()
    await Promise.resolve()
    f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "x".repeat(65537) })
    await rejected
    f.contents.debugger.emit("detach")
    await expect(f.adapter.execute(f.request())).rejects.toThrow()
    expect(f.commands.filter((call) => call.method === "WebMCP.invokeTool")).toHaveLength(1)
    f.adapter.close()
  })
  test("rejects a native invoke while a page operation is in flight", async () => {
    let releaseRead
    const f = await fixture()
    f.contents.executeJavaScriptInIsolatedWorld = () =>
      new Promise((resolve) => {
        releaseRead = resolve
      })
    const readInFlight = f.adapter.execute({
      requestID: randomUUID(),
      generation: f.adapter.generation,
      origin: "https://example.com",
      frameId: "top",
      operation: "read",
      deadline: Date.now() + 5000,
    })
    await Promise.resolve()
    await expect(f.adapter.execute(f.request())).rejects.toThrow("Native operation is unavailable")
    expect(f.commands.some((call) => call.method === "WebMCP.invokeTool")).toBe(false)
    releaseRead({ title: "", text: "", outline: [] })
    await readInFlight
    f.adapter.close()
  })
})

describe("pageKind", () => {
  test("separates a blank pane from a loaded page the agent cannot be granted", () => {
    const { pageKind, agentOrigin } = createRequire(import.meta.url)("./native-webmcp.js")
    const kind = (url) => pageKind(url, agentOrigin(url))
    expect(kind("")).toBe("blank")
    expect(kind("about:blank")).toBe("blank")
    expect(kind("https://trip.com/")).toBe("ready")
    expect(kind("http://127.0.0.1:3000/")).toBe("ready")
    expect(kind("http://localhost:5173/")).toBe("ready")
    expect(kind("http://[::1]:3000/")).toBe("ready")
    // The pane reports what the runtime's own WebMCP origin rule accepts (its `WEBMCP_LOOPBACK_HOSTS`, shared by
    // the approval store and the TUI allowlist dialog): another loopback address is a page the bridge policy
    // refuses, so "ready" here would offer a grant the server rejects.
    expect(kind("http://127.0.0.2:8080/")).toBe("unsupported")
    expect(kind("http://127.255.0.1/")).toBe("unsupported")
    expect(kind("http://trip.com/")).toBe("unsupported")
    expect(kind("chrome-error://chromewebdata/")).toBe("unsupported")
  })
  describe("page interaction", () => {
    const interactive = async (outputs) => {
      const f = await fixture()
      const scripts = []
      f.contents.executeJavaScriptInIsolatedWorld = async (world, [{ code }]) => {
        scripts.push({ world, code })
        const next = outputs.shift()
        if (typeof next === "function") next()
        return typeof next === "function" ? { ok: true } : next
      }
      const ask = (operation, extra = {}) => ({
        requestID: randomUUID(),
        generation: f.adapter.generation,
        origin: "https://example.com",
        frameId: "top",
        operation,
        deadline: Date.now() + 5000,
        ...extra,
      })
      return { ...f, scripts, ask }
    }
    test("reads the page and then acts only on that read", async () => {
      const f = await interactive([
        { title: "T", text: "hello", outline: [{ ref: "e1", kind: "button", name: "Go" }] },
        { ok: true },
      ])
      const read = await f.adapter.execute(f.ask("read"))
      expect(read.output).toMatchObject({ title: "T", text: "hello" })
      expect(f.scripts[0].world).toBe(1998)
      const acted = await f.adapter.execute(f.ask("act", { readId: read.output.readId, ref: "e1", how: "click" }))
      expect(acted.output).toEqual({ done: true, how: "click", navigated: false })
      await expect(f.adapter.execute(f.ask("act", { readId: randomUUID(), ref: "e1", how: "click" }))).rejects.toThrow(
        "stale",
      )
      f.adapter.close()
    })
    test("a navigation retires the read and an action reports the new document", async () => {
      const f = await interactive([{ title: "", text: "", outline: [] }])
      const read = await f.adapter.execute(f.ask("read"))
      f.adapter.invalidate()
      await expect(
        f.adapter.execute(
          f.ask("act", { readId: read.output.readId, ref: "e1", how: "click", generation: f.adapter.generation }),
        ),
      ).rejects.toThrow("stale")
      f.adapter.close()
    })
    test("withdrawing access stops an act that is already running before it can type", async () => {
      let f
      f = await interactive([
        { title: "", text: "", outline: [{ ref: "e1" }] },
        () => f.adapter.revoke({ cancelPageRequest: true }),
      ])
      const read = await f.adapter.execute(f.ask("read"))
      await expect(
        f.adapter.execute(f.ask("act", { readId: read.output.readId, ref: "e1", how: "type", text: "secret" })),
      ).rejects.toThrow("canceled")
      f.adapter.close()
    })

    test("a click that changes the document replies with the new generation", async () => {
      let f
      f = await interactive([{ title: "", text: "", outline: [{ ref: "e1" }] }, () => f.adapter.invalidate()])
      const read = await f.adapter.execute(f.ask("read"))
      const request = f.ask("act", { readId: read.output.readId, ref: "e1", how: "click" })
      const reply = await f.adapter.execute(request)
      expect(reply.generation).not.toBe(request.generation)
      expect(reply.output.navigated).toBe(true)
      f.adapter.close()
    })
    test("rejects a request for another document and surfaces a page refusal", async () => {
      const f = await interactive([{ error: "not-typable" }])
      await expect(f.adapter.execute({ ...f.ask("read"), generation: randomUUID() })).rejects.toThrow()
      f.adapter.readId = randomUUID()
      await expect(
        f.adapter.execute(f.ask("act", { readId: f.adapter.readId, ref: "e1", how: "type", text: "x" })),
      ).rejects.toThrow("not-typable")
      f.adapter.close()
    })
  })
})

test("manual deadline expiry is a timeout rather than a claimed cancellation", async () => {
  const f = await fixture()
  const request = { ...f.request(), deadline: Date.now() + 20 }
  await expect(f.adapter.execute(request)).rejects.toMatchObject({ outcome: "timeout", reason: "timeout" })
  expect(f.commands.filter((command) => command.method === "WebMCP.invokeTool")).toHaveLength(1)
  f.adapter.close()
})

test("explicit adapter cancellation retains its outcome and never retries", async () => {
  const f = await fixture()
  const request = f.request()
  const pending = f.adapter.execute(request)
  const rejected = expect(pending).rejects.toMatchObject({ outcome: "cancelled", reason: "cancelled" })
  await Promise.resolve()
  const stopping = f.adapter.cancel(request.requestID)
  f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Canceled" })
  expect(await stopping).toEqual({ requestID: request.requestID, state: "stopped" })
  await rejected
  expect(f.commands.filter((command) => command.method === "WebMCP.invokeTool")).toHaveLength(1)
  f.adapter.close()
})

test("an expired deadline before dispatch reports timeout without invoking the page", async () => {
  const f = await fixture()
  await expect(f.adapter.execute({ ...f.request(), deadline: Date.now() - 1 })).rejects.toMatchObject({
    outcome: "timeout",
    reason: "timeout",
  })
  expect(f.commands.some((command) => command.method === "WebMCP.invokeTool")).toBe(false)
  f.adapter.close()
})

test("the 64 KiB input limit counts serialized UTF-8 bytes and has its own reason", async () => {
  const f = await fixture()
  // JSON overhead is eight bytes; two UTF-8 bytes per character reaches the exact limit.
  const input = { x: "é".repeat((65536 - 8) / 2) }
  expect(Buffer.byteLength(JSON.stringify(input))).toBe(65536)
  await expect(f.adapter.execute({ ...f.request(), input: { x: input.x + "é" } })).rejects.toMatchObject({
    outcome: "failed",
    reason: "input-too-large",
  })
  expect(f.commands.some((command) => command.method === "WebMCP.invokeTool")).toBe(false)
  const pending = f.adapter.execute({ ...f.request(), input })
  await Promise.resolve()
  f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "ok" })
  expect(await pending).toMatchObject({ status: "Completed", output: "ok" })
  f.adapter.close()
})

test.each(["removed", "replaced"])("reports the executed result after the tool is %s", async (change) => {
  const f = await fixture()
  const pending = f.adapter.execute(f.request())
  await Promise.resolve()
  f.emit("WebMCP.toolsRemoved", { tools: [fixtureTool] })
  if (change === "replaced") f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, description: "Updated" }] })
  f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "changed once" })
  expect(await pending).toMatchObject({ status: "Completed", output: "changed once" })
  expect(f.adapter.available).toBe(true)
  expect(f.commands.filter((command) => command.method === "WebMCP.invokeTool")).toHaveLength(1)
  f.adapter.close()
})

test.each([true, false])("oversized result has its own reason (before native acknowledgement: %s)", async (early) => {
  const f = await fixture()
  const pending = f.adapter.execute(f.request())
  const rejected = expect(pending).rejects.toMatchObject({ outcome: "failed", reason: "result-too-large" })
  if (!early) await Promise.resolve()
  f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "x".repeat(65537) })
  await rejected
  expect(f.adapter.available).toBe(true)
  expect(f.commands.filter((command) => command.method === "WebMCP.invokeTool")).toHaveLength(1)
  f.adapter.close()
})

test("names a rejected catalog and keeps the browser connected", async () => {
  const f = await fixture()
  const accepted = [{ ...fixtureTool, name: "unrelated" }]
  f.emit("WebMCP.toolsAdded", { tools: accepted })
  f.emit("WebMCP.toolsAdded", { tools: [fixtureTool, { ...fixtureTool, description: "other" }] })
  expect(f.adapter.available).toBe(true)
  expect(f.adapter.snapshot().tools).toEqual(accepted)
  expect(f.adapter.snapshot().origin).toBe("https://example.com")
  expect(f.adapter.catalogRejection).toEqual({ code: "invalid-catalog", reason: "duplicate-name", tool: "echo" })

  f.emit("WebMCP.toolsAdded", {
    tools: [{ name: "bad", description: "Bad", frameId: "top", inputSchema: [] }],
  })
  expect(f.adapter.available).toBe(true)
  expect(f.adapter.snapshot().tools).toEqual(accepted)
  expect(f.adapter.catalogRejection).toEqual({ code: "invalid-catalog", reason: "invalid-schema", tool: "bad" })

  const long = "n".repeat(300)
  f.emit("WebMCP.toolsAdded", { tools: [{ name: long, description: "Bad", frameId: "top" }] })
  expect(f.adapter.available).toBe(true)
  expect(f.adapter.snapshot().tools).toEqual(accepted)
  expect(f.adapter.catalogRejection).toEqual({
    code: "invalid-catalog",
    reason: "invalid-name",
    tool: long.slice(0, 64),
  })

  const cycle = { type: "object" }
  cycle.self = cycle
  f.emit("WebMCP.toolsAdded", { tools: [{ name: "cycle", description: "Cycle", frameId: "top", inputSchema: cycle }] })
  expect(f.adapter.available).toBe(true)
  expect(f.adapter.snapshot().tools).toEqual(accepted)
  expect(f.adapter.catalogRejection).toMatchObject({ reason: "invalid-schema", tool: "cycle" })

  f.emit("WebMCP.toolsAdded", { tools: [] })
  expect(f.adapter.catalogRejection).toMatchObject({ reason: "invalid-schema", tool: "cycle" })
  expect(f.adapter.snapshot().tools).toEqual(accepted)

  f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, description: "Updated" }] })
  expect(f.adapter.catalogRejection).toBeNull()
  expect(f.adapter.available).toBe(true)
  expect(f.adapter.snapshot().tools.map((tool) => tool.description)).toEqual([fixtureTool.description, "Updated"])
  expect(f.adapter.snapshot().tools[0]).not.toHaveProperty("kind")

  f.contents.emit("did-start-navigation", {}, "https://example.com/", false, true)
  expect(f.adapter.catalogRejection).toBeNull()
  expect(f.adapter.snapshot().tools).toEqual([])
  expect(f.adapter.available).toBe(true)
  f.adapter.close()
})

test("a form tool is not stored on the invocation digest, and hints do not authorize a call", async () => {
  const f = await fixture()
  f.emit("WebMCP.toolsAdded", {
    tools: [{ ...fixtureTool, backendNodeId: 7, annotations: { readOnly: true, consequentialHint: "yes" } }],
  })
  const stored = f.adapter.snapshot().tools[0]
  expect(stored).toEqual({ ...fixtureTool, annotations: { readOnly: true, consequentialHint: "yes" } })
  expect(stored).not.toHaveProperty("backendNodeId")
  expect(stored).not.toHaveProperty("kind")
  expect(f.adapter.toolKinds.get("echo")).toBe("form")
  expect(definitionDigest(stored)).toBe(definitionDigest({ ...fixtureTool, annotations: stored.annotations }))
  f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, backendNodeId: 1.5 }] })
  expect(f.adapter.toolKinds.get("echo")).toBe("script")
  expect(f.adapter.catalogRejection).toBeNull()
  expect(f.adapter.available).toBe(true)
  f.adapter.close()
})

test("an unrelated oversized response cannot reject the active invocation", async () => {
  const f = await fixture()
  const pending = f.adapter.execute(f.request())
  await Promise.resolve()
  f.emit("WebMCP.toolResponded", { invocationId: "another-call", status: "Completed", output: "x".repeat(65537) })
  f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "ok" })
  expect(await pending).toMatchObject({ output: "ok" })
  f.adapter.close()
})

// A command acknowledgement alone does not prove the page acknowledged cancellation.
test("cancellation awaits the matching page response, not the CDP command reply", async () => {
  const f = await fixture()
  const request = f.request()
  const execution = f.adapter.execute(request).catch((error) => error)
  await Promise.resolve()
  let returned = false
  const stopping = f.adapter.cancel(request.requestID).then((result) => {
    returned = true
    return result
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(returned).toBe(false)
  f.emit("WebMCP.toolResponded", { invocationId: "unrelated", status: "Canceled" })
  await Promise.resolve()
  expect(returned).toBe(false)
  f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Canceled" })
  expect(await stopping).toMatchObject({ state: "stopped" })
  expect(await execution).toMatchObject({ outcome: "cancelled" })
  f.adapter.close()
})

test("a missing page acknowledgement is bounded and keeps overlapping work blocked", async () => {
  const f = await fixture()
  vi.useFakeTimers()
  try {
    const request = f.request()
    const execution = f.adapter.execute(request).catch((error) => error)
    await Promise.resolve()
    const stopping = f.adapter.cancel(request.requestID)
    await vi.advanceTimersByTimeAsync(500)
    expect(await stopping).toEqual({ requestID: request.requestID, state: "still-finishing" })
    expect(await execution).toMatchObject({ outcome: "uncertain" })
    await expect(f.adapter.execute(f.request())).rejects.toThrow("unavailable")
    f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "late" })
    expect(f.adapter.pending.size).toBe(0)
  } finally {
    f.adapter.close()
    vi.useRealTimers()
  }
})

test.each(["read", "act", "wait"])(
  "interrupts a running %s through the debugger and awaits script settlement",
  async (operation) => {
    const f = await fixture()
    let interrupt
    f.contents.executeJavaScriptInIsolatedWorld = () =>
      new Promise((_resolve, reject) => {
        interrupt = reject
      })
    f.adapter.readId = randomUUID()
    const request = { ...f.request(), operation, readId: f.adapter.readId, ref: "e1", how: "click", waitText: "ready" }
    const execution = f.adapter.execute(request).catch((error) => error)
    const stopping = f.adapter.cancel(request.requestID)
    expect(f.commands).toContainEqual({ method: "Runtime.terminateExecution", args: undefined })
    let returned = false
    void stopping.then(() => {
      returned = true
    })
    await Promise.resolve()
    expect(returned).toBe(false)
    interrupt(new Error("Execution terminated"))
    expect(await stopping).toMatchObject({ state: "stopped" })
    expect(await execution).toBeInstanceOf(Error)
    expect(f.adapter.interacting).toBe(false)
    f.adapter.close()
  },
)

test.each([false, true])(
  "cancel during the post-click delay does not interrupt a script (navigated: %s)",
  async (navigated) => {
    const f = await fixture()
    vi.useFakeTimers()
    try {
      f.contents.executeJavaScriptInIsolatedWorld = async () => ({ ok: true })
      f.adapter.readId = randomUUID()
      const request = { ...f.request(), operation: "act", readId: f.adapter.readId, ref: "e1", how: "click" }
      const execution = f.adapter.execute(request).catch((error) => error)
      await vi.advanceTimersByTimeAsync(0)
      if (navigated) {
        f.contents.getURL = () => "https://example.org/replacement"
        f.emit("Page.frameNavigated", { frame: { id: "top" } })
        expect(f.adapter.generation).not.toBe(request.generation)
      }
      const stopping = f.adapter.cancel(request.requestID)
      expect(f.commands.some(({ method }) => method === "Runtime.terminateExecution")).toBe(false)
      await vi.advanceTimersByTimeAsync(300)
      expect(await stopping).toEqual({ requestID: request.requestID, state: "stopped" })
      expect(await execution).toMatchObject({ message: "The browser request was canceled" })
    } finally {
      f.adapter.close()
      vi.useRealTimers()
    }
  },
)

test.each(["navigation", "revocation"])(
  "interrupts an unsettled script only in its original document: %s",
  async (change) => {
    const f = await fixture()
    let settle
    f.contents.executeJavaScriptInIsolatedWorld = () =>
      new Promise((resolve) => {
        settle = resolve
      })
    const request = { ...f.request(), operation: "read" }
    const execution = f.adapter.execute(request).catch((error) => error)
    try {
      if (change === "navigation") {
        // A same-URL reload still replaces the document, even before the old script promise settles.
        f.emit("Page.frameNavigated", { frame: { id: "top" } })
      } else {
        await f.adapter.revoke()
      }
      expect(f.adapter.generation).not.toBe(request.generation)
      const stopping = f.adapter.cancel(request.requestID)
      expect(f.commands.some(({ method }) => method === "Runtime.terminateExecution")).toBe(change === "revocation")
      settle({ title: "", text: "", outline: [] })
      expect(await stopping).toMatchObject({ state: "stopped" })
      expect(await execution).toBeInstanceOf(Error)
    } finally {
      settle({})
      await execution
      f.adapter.close()
    }
  },
)

test("navigation retires a canceled invocation even when the old page never responds", async () => {
  const f = await fixture()
  vi.useFakeTimers()
  try {
    const execution = f.adapter.execute(f.request()).catch((error) => error)
    await Promise.resolve()
    f.adapter.invalidate()
    await vi.advanceTimersByTimeAsync(500)
    expect(await execution).toMatchObject({ outcome: "uncertain" })
    expect(f.adapter.pending.size).toBe(0)
    f.emit("WebMCP.toolsAdded", { tools: [fixtureTool] })
    const next = f.adapter.execute(f.request())
    await Promise.resolve()
    f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "new document" })
    expect(await next).toMatchObject({ output: "new document" })
  } finally {
    f.adapter.close()
    vi.useRealTimers()
  }
})

// Electron may never settle a script promise when navigation destroys its context.
test.each(["read", "wait", "act"])("bounds a lost %s script and admits work on the new document", async (operation) => {
  const f = await fixture()
  vi.useFakeTimers()
  try {
    let settleOld
    f.contents.executeJavaScriptInIsolatedWorld = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleOld = resolve
          }),
      )
      .mockResolvedValue({ title: "new", text: "ready", outline: [] })
    f.adapter.readId = randomUUID()
    const request = { ...f.request(), operation, readId: f.adapter.readId, ref: "e1", how: "click", waitText: "ready" }
    let settled = false
    const execution = f.adapter
      .execute(request)
      .catch((error) => error)
      .finally(() => {
        settled = true
      })
    f.adapter.invalidate()
    await vi.advanceTimersByTimeAsync(1001)
    expect(settled).toBe(true)
    expect(await execution).toMatchObject({ outcome: "timeout", reason: "timeout" })
    expect(f.adapter.interacting).toBe(false)
    expect(f.adapter.activePageRequestId).toBeNull()
    expect(f.adapter.executingPageScript).toBeNull()
    const next = await f.adapter.execute({ ...f.request(), operation: "read" })
    expect(next.output.title).toBe("new")
    settleOld({ title: "old", text: "", outline: [] })
    await Promise.resolve()
    expect(f.adapter.readId).toBe(next.output.readId)
    expect(f.commands.some(({ method }) => method === "Runtime.terminateExecution")).toBe(false)
  } finally {
    f.adapter.close()
    vi.useRealTimers()
  }
})

test("an interaction deadline keeps the same-document guard until settlement or navigation", async () => {
  const f = await fixture()
  vi.useFakeTimers()
  try {
    let settleOld
    let settleNew
    f.contents.executeJavaScriptInIsolatedWorld = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleOld = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleNew = resolve
          }),
      )
    const request = { ...f.request(), operation: "read" }
    const execution = f.adapter.execute(request).catch((error) => error)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await execution).toMatchObject({ outcome: "timeout", reason: "timeout" })
    expect(f.commands.filter(({ method }) => method === "Runtime.terminateExecution")).toHaveLength(1)
    await expect(f.adapter.execute({ ...f.request(), operation: "read" })).rejects.toThrow("in progress")
    f.adapter.invalidate()
    const next = f.adapter.execute({ ...f.request(), operation: "read" })
    const activeId = f.adapter.activePageRequestId
    settleOld({ title: "old", text: "", outline: [] })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.adapter.activePageRequestId).toBe(activeId)
    expect(f.adapter.interacting).toBe(true)
    settleNew({ title: "new", text: "", outline: [] })
    expect((await next).output.title).toBe("new")
    expect(f.adapter.interacting).toBe(false)
  } finally {
    f.adapter.close()
    vi.useRealTimers()
  }
})

const rejectedReplacements = [
  ["null-entry", () => [null]],
  ["missing-frame", () => [{ ...fixtureTool, frameId: undefined }]],
  ["invalid-description", () => [{ ...fixtureTool, description: "x".repeat(4097) }]],
  ["missing-description", () => [{ ...fixtureTool, description: undefined }]],
  ["invalid-schema", () => [{ ...fixtureTool, inputSchema: [] }]],
  ["invalid-annotations", () => [{ ...fixtureTool, annotations: [] }]],
  ["definition-too-large", () => [{ ...fixtureTool, inputSchema: { value: "x".repeat(33000) } }]],
  [
    "cycle",
    () => {
      const schema = {}
      schema.self = schema
      return [{ ...fixtureTool, inputSchema: schema }]
    },
  ],
  ["nesting", () => [{ ...fixtureTool, inputSchema: Array.from({ length: 40 }).reduce((inner) => ({ inner }), {}) }]],
  ["duplicate-name", () => [fixtureTool, fixtureTool]],
  ["earlier-invalid-entry", () => [{ ...fixtureTool, name: "bad", description: null }, fixtureTool]],
  ["later-invalid-entry", () => [fixtureTool, { ...fixtureTool, name: "bad", description: null }]],
  ["unknown-name", () => [{ ...fixtureTool, name: null }]],
  ["malformed-batch", () => null],
  [
    "catalog-too-large",
    () => [fixtureTool, ...Array.from({ length: 129 }, (_, index) => ({ ...fixtureTool, name: `extra${index}` }))],
  ],
]

test.each(rejectedReplacements)("rejected replacement %s retires every affected identity", async (_reason, batch) => {
  const f = await fixture()
  const old = f.request()
  f.emit("WebMCP.toolsAdded", { tools: batch() })
  expect(f.adapter.catalogRejection).not.toBeNull()
  expect(f.adapter.snapshot().tools.find((tool) => tool.name === old.toolName)).toBeUndefined()
  expect(f.adapter.toolKinds.has(old.toolName)).toBe(false)
  await expect(f.adapter.execute(old)).rejects.toThrow()
  // A fresh generation cannot authorize a rejected definition using the old digest either.
  await expect(f.adapter.execute(f.request())).rejects.toMatchObject({ reason: "definition-changed" })
  expect(f.commands.some(({ method }) => method === "WebMCP.invokeTool")).toBe(false)
  f.adapter.close()
})

test.each(["remove", "replace", "reject"])(
  "%s then identical registration never revives an old request",
  async (change) => {
    const f = await fixture()
    const old = f.request()
    if (change === "remove") f.emit("WebMCP.toolsRemoved", { tools: [fixtureTool] })
    if (change === "reject") f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, description: null }] })
    f.emit("WebMCP.toolsAdded", { tools: [fixtureTool] })
    await expect(f.adapter.execute(old)).rejects.toThrow()
    expect(f.commands.some(({ method }) => method === "WebMCP.invokeTool")).toBe(false)
    const fresh = f.adapter.execute(f.request())
    await Promise.resolve()
    f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "ok" })
    await expect(fresh).resolves.toMatchObject({ output: "ok" })
    f.adapter.close()
  },
)

test.each(["frameId", "name", "description"])("dispatch verifies current accepted definition %s", async (field) => {
  const f = await fixture()
  const current = { ...fixtureTool, [field]: "different" }
  f.adapter.tools.set(fixtureTool.name, current)
  // A matching digest alone is insufficient when frame or name differs from the request.
  const request = {
    ...f.request(),
    digest: field === "description" ? definitionDigest(fixtureTool) : definitionDigest(current),
  }
  await expect(f.adapter.execute(request)).rejects.toMatchObject({ reason: "definition-changed" })
  expect(f.commands.some(({ method }) => method === "WebMCP.invokeTool")).toBe(false)
  f.adapter.close()
})

test("catalog rejection redacts the full tool name before shortening it", async () => {
  const f = await fixture()
  const name = "x".repeat(55) + " ghp_" + "a".repeat(36)
  const tool = { ...fixtureTool, name }
  f.emit("WebMCP.toolsAdded", { tools: [tool, tool] })
  expect(f.adapter.catalogRejection).toEqual({ code: "invalid-catalog", reason: "duplicate-name", tool: "[redacted]" })
  f.adapter.close()
})


test("closing a destroyed native guest retires calls and removes captured debugger listeners", async () => {
  const f = await fixture()
  const debuggerHandle = f.contents.debugger
  const request = f.request()
  const pending = f.adapter.execute(request)
  const rejected = expect(pending).rejects.toMatchObject({ outcome: "uncertain", reason: "provider-gone" })
  await Promise.resolve()
  f.contents.isDestroyed = () => true
  Object.defineProperty(f.contents, "debugger", { get: () => { throw new Error("Object has been destroyed") } })
  expect(() => f.adapter.close()).not.toThrow()
  await rejected
  expect(f.adapter.pending.size).toBe(0)
  expect(debuggerHandle.listenerCount("message")).toBe(0)
  expect(debuggerHandle.listenerCount("detach")).toBe(0)
  expect(f.contents.listenerCount("did-start-navigation")).toBe(0)
})
