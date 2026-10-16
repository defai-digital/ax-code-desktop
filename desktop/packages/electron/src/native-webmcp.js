"use strict"

const { createHash, randomUUID } = require("node:crypto")
const page = require("./webmcp-page")

const CAPABILITY = "desktop.webmcp.v1"
const MAX_RESULT_BYTES = 65536
const byteSize = (value) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8")
const canonical = (value, depth = 0) => {
  if (depth > 32) throw new Error("WebMCP JSON nesting limit exceeded")
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
const definitionDigest = (tool) => createHash("sha256").update(canonical(tool)).digest("hex")
const allowedUrl = (value) => {
  try {
    const url = new URL(value)
    return (
      !url.username &&
      !url.password &&
      (url.href === "about:blank" || url.protocol === "https:" || url.protocol === "http:")
    )
  } catch {
    return false
  }
}
const agentOrigin = (value) => {
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    // `localhost`, `127.0.0.1` and `[::1]` — the runtime's own WebMCP origin rule (its `WEBMCP_LOOPBACK_HOSTS`,
    // shared by the bridge policy, the approval store and the TUI allowlist dialog), which is also what the UI's
    // copy of it offers. Every 127.x.x.x address is loopback, but this pane has to report what the runtime will
    // accept: accepting more here made a page the bridge policy refuses read as "ready".
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
    return url.protocol === "https:" || (url.protocol === "http:" && loopback) ? url.origin : null
  } catch {
    return null
  }
}

// Explains a null origin to the UI: a blank pane needs a URL, while a loaded page the agent cannot be
// granted (for example http:// on a public host, or an error page) needs a different one.
const pageKind = (url, origin) => {
  if (origin) return "ready"
  if (!url || url === "about:blank") return "blank"
  return "unsupported"
}

// Only this adapter owns the native debugger. No caller can supply a CDP command or target.
class NativeWebMcp {
  constructor(contents, changed = () => {}) {
    this.contents = contents
    this.changed = changed
    this.generation = randomUUID()
    this.frameId = ""
    this.tools = new Map()
    this.pending = new Map()
    this.closed = false
    this.available = false
    // The read whose element references the page may still act on; cleared with every document.
    this.readId = null
    this.interacting = false
    this.message = (_event, method, params) => this.onMessage(method, params)
    this.navigation = (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) this.invalidate()
    }
    this.detached = () => {
      this.available = false
      this.invalidate()
    }
    this.gone = () => {
      this.available = false
      this.invalidate()
    }
  }
  async start() {
    const contents = this.contents
    contents.on("did-start-navigation", this.navigation)
    contents.on("render-process-gone", this.gone)
    contents.debugger.on("message", this.message)
    contents.debugger.on("detach", this.detached)
    try {
      contents.debugger.attach("1.3")
      await contents.debugger.sendCommand("Page.enable")
      const { frameTree } = await contents.debugger.sendCommand("Page.getFrameTree")
      this.frameId = frameTree.frame.id
      await contents.debugger.sendCommand("WebMCP.enable")
      this.available = true
    } catch {
      this.close()
      throw new Error("The bundled browser does not provide native WebMCP")
    }
  }
  invalidate() {
    this.tools.clear()
    this.revoke()
  }
  revoke() {
    this.generation = randomUUID()
    this.readId = null
    for (const id of [...this.pending.keys()]) this.cancel(id)
    this.changed()
  }
  onMessage(method, params) {
    if (this.closed) return
    if (method === "Page.frameNavigated" && !params.frame.parentId) {
      this.frameId = params.frame.id
      this.invalidate()
    } else if (method === "WebMCP.toolsAdded") {
      try {
        for (const tool of params.tools) {
          if (tool.frameId !== this.frameId) continue
          if (this.tools.has(tool.name)) throw new Error("Duplicate native tool names are ambiguous")
          const definition = {
            name: tool.name,
            description: tool.description,
            frameId: tool.frameId,
            ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
            ...(tool.annotations ? { annotations: tool.annotations } : {}),
          }
          if (
            typeof tool.name !== "string" ||
            !tool.name ||
            tool.name.length > 256 ||
            typeof tool.description !== "string" ||
            tool.description.length > 4096 ||
            byteSize(definition) > 32768
          ) {
            throw new Error("Invalid native tool catalog")
          }
          this.tools.set(tool.name, definition)
        }
        if (this.tools.size > 128 || byteSize([...this.tools.values()]) > 262144)
          throw new Error("Native catalog exceeds limits")
        this.changed()
      } catch {
        this.available = false
        this.invalidate()
      }
    } else if (method === "WebMCP.toolsRemoved") {
      for (const tool of params.tools) if (tool.frameId === this.frameId) this.tools.delete(tool.name)
      this.changed()
    } else if (method === "WebMCP.toolResponded") {
      if (byteSize(params.output) > MAX_RESULT_BYTES) {
        for (const id of [...this.pending.keys()]) this.cancel(id)
        return
      }
      const pending = [...this.pending.values()].find((entry) => entry.invocationId === params.invocationId)
      if (pending) pending.finish(params)
      // Responses that race the invokeTool acknowledgement stay bounded on the active call.
      else for (const entry of this.pending.values()) if (!entry.invocationId) entry.early = params
    }
  }
  snapshot() {
    const origin = agentOrigin(this.contents.getURL())
    return {
      generation: this.generation,
      origin,
      frameId: this.frameId,
      tools: origin && this.available ? [...this.tools.values()] : [],
    }
  }
  async execute(request) {
    const snapshot = this.snapshot()
    if (
      this.closed ||
      !this.available ||
      request.generation !== snapshot.generation ||
      request.origin !== snapshot.origin ||
      request.frameId !== snapshot.frameId ||
      request.deadline <= Date.now()
    ) {
      throw new Error("The browser document or request lifetime changed")
    }
    if (request.operation === "list")
      return { requestID: request.requestID, generation: request.generation, status: "Completed", snapshot }
    if (["read", "act", "wait"].includes(request.operation)) return this.interact(request)
    if (request.operation !== "invoke" || this.pending.size !== 0 || this.interacting)
      throw new Error("Native operation is unavailable")
    const tool = this.tools.get(request.toolName)
    if (!tool || definitionDigest(tool) !== request.digest) throw new Error("The native tool definition changed")
    if (
      !request.input ||
      Array.isArray(request.input) ||
      typeof request.input !== "object" ||
      byteSize(request.input) > 65536
    ) {
      throw new Error("Invalid native tool input")
    }
    return new Promise((resolve, reject) => {
      const finish = (result) => {
        clearTimeout(timer)
        this.pending.delete(request.requestID)
        const current = this.snapshot()
        if (
          this.closed ||
          current.generation !== request.generation ||
          current.origin !== request.origin ||
          !this.available ||
          definitionDigest(this.tools.get(request.toolName) ?? {}) !== request.digest ||
          Date.now() >= request.deadline ||
          result.status !== "Completed" ||
          byteSize(result.output) > MAX_RESULT_BYTES
        ) {
          reject(new Error("Native completion is unconfirmed; do not retry automatically"))
        } else
          resolve({
            requestID: request.requestID,
            generation: request.generation,
            status: "Completed",
            output: result.output,
          })
      }
      const timer = setTimeout(() => this.cancel(request.requestID), Math.min(30000, request.deadline - Date.now()))
      const entry = {
        invocationId: null,
        early: null,
        finish,
        reject: () => {
          clearTimeout(timer)
          this.pending.delete(request.requestID)
          reject(new Error("Native invocation canceled; completion is unconfirmed"))
        },
      }
      this.pending.set(request.requestID, entry)
      this.contents.debugger
        .sendCommand("WebMCP.invokeTool", {
          frameId: request.frameId,
          toolName: request.toolName,
          input: request.input,
        })
        .then(({ invocationId }) => {
          entry.invocationId = invocationId
          if (!this.pending.has(request.requestID)) {
            return this.contents.debugger.sendCommand("WebMCP.cancelInvocation", { invocationId }).catch(() => {})
          }
          if (entry.early?.invocationId === invocationId) finish(entry.early)
        })
        .catch(() => entry.reject())
    })
  }
  /**
   * Read the enrolled page or act on an element from the last read. The program is fixed and runs in an
   * isolated world; only validated values reach it. A click may legitimately change the document, so an
   * action replies with whatever generation the page ended on.
   */
  async interact(request) {
    if (this.interacting || this.pending.size !== 0) throw new Error("Another browser operation is in progress")
    const args = page.validate(request)
    this.interacting = true
    try {
      const run = async (payload) => {
        // Electron resolves with the script's own value, not a list of results.
        const result = await this.contents.executeJavaScriptInIsolatedWorld(page.WORLD_ID, [
          { code: page.program(payload) },
        ])
        if (this.closed || Date.now() >= request.deadline) throw new Error("The browser request lifetime changed")
        return result
      }
      const done = (output) => ({
        requestID: request.requestID,
        generation: this.generation,
        status: "Completed",
        output,
      })
      if (request.operation === "read") {
        const readId = randomUUID()
        const result = await run({ op: "read", readId, maxText: page.MAX_TEXT, maxElements: page.MAX_ELEMENTS })
        if (request.generation !== this.generation) throw new Error("The browser document changed")
        this.readId = readId
        return done(page.fit({ readId, ...result }))
      }
      if (request.operation === "wait") {
        const result = await run({ op: "wait", ...args })
        if (request.generation !== this.generation) throw new Error("The browser document changed")
        return done(result)
      }
      if (args.readId !== this.readId) throw new Error("Element references are stale; read the page again")
      const result = await run({ op: "act", ...args })
      if (result?.error) throw new Error(`The page refused the action: ${result.error}`)
      // Let a navigation the action started surface, so the reply carries the document it landed on.
      await new Promise((resolve) => setTimeout(resolve, 300))
      return done({ done: true, how: args.how, navigated: this.generation !== request.generation })
    } finally {
      this.interacting = false
    }
  }
  cancel(requestID) {
    const pending = this.pending.get(requestID)
    if (!pending) return
    if (pending.invocationId)
      this.contents.debugger
        .sendCommand("WebMCP.cancelInvocation", { invocationId: pending.invocationId })
        .catch(() => {})
    pending.reject()
  }
  close() {
    if (this.closed) return
    this.closed = true
    this.available = false
    for (const id of [...this.pending.keys()]) this.cancel(id)
    this.contents.removeListener("did-start-navigation", this.navigation)
    this.contents.removeListener("render-process-gone", this.gone)
    this.contents.debugger.removeListener("message", this.message)
    this.contents.debugger.removeListener("detach", this.detached)
    if (this.contents.debugger.isAttached()) this.contents.debugger.detach()
  }
}

module.exports = { NativeWebMcp, definitionDigest, CAPABILITY, agentOrigin, allowedUrl, pageKind }
