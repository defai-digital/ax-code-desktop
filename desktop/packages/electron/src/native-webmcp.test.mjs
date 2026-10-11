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
