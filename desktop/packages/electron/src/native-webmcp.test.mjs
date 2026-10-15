import { describe, expect, test } from "vitest"
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
  test("tool replacement cannot turn an old approval into a successful result", async () => {
    const f = await fixture()
    const pending = f.adapter.execute(f.request())
    const rejected = expect(pending).rejects.toThrow()
    await Promise.resolve()
    f.emit("WebMCP.toolsAdded", { tools: [{ ...fixtureTool, description: "Replaced" }] })
    f.emit("WebMCP.toolResponded", { invocationId: "native-call", status: "Completed", output: "stale" })
    await rejected
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
        return [typeof next === "function" ? { ok: true } : next]
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
      const f = await interactive([{ title: "T", text: "hello", outline: [{ ref: "e1", kind: "button", name: "Go" }] }, { ok: true }])
      const read = await f.adapter.execute(f.ask("read"))
      expect(read.output).toMatchObject({ title: "T", text: "hello" })
      expect(f.scripts[0].world).toBe(1998)
      const acted = await f.adapter.execute(f.ask("act", { readId: read.output.readId, ref: "e1", how: "click" }))
      expect(acted.output).toEqual({ done: true, how: "click", navigated: false })
      await expect(
        f.adapter.execute(f.ask("act", { readId: randomUUID(), ref: "e1", how: "click" })),
      ).rejects.toThrow("stale")
      f.adapter.close()
    })
    test("a navigation retires the read and an action reports the new document", async () => {
      const f = await interactive([{ title: "", text: "", outline: [] }])
      const read = await f.adapter.execute(f.ask("read"))
      f.adapter.invalidate()
      await expect(
        f.adapter.execute(f.ask("act", { readId: read.output.readId, ref: "e1", how: "click", generation: f.adapter.generation })),
      ).rejects.toThrow("stale")
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
