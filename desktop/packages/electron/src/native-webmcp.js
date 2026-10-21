"use strict"

const { createHash, randomUUID } = require("node:crypto")
const page = require("./webmcp-page")

const CAPABILITY = "desktop.webmcp.v1"
const MAX_RESULT_BYTES = 65536
// Fixed metadata only: page exceptions and debugger errors may contain credentials.
const invocationError = (outcome, reason, message = "Native completion is unconfirmed; do not retry automatically") =>
  Object.assign(new Error(message), { outcome, reason })
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
const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)
// Identity of a tool for the builder. Frame ids change on reload, so they are not part of this digest:
// a same-definition reload must still match drafts and must not look like a schema change.
const catalogIdentity = (tool) => {
  const identity = { name: tool.name, description: tool.description }
  if (tool.inputSchema !== undefined) identity.inputSchema = tool.inputSchema
  if (tool.annotations !== undefined) identity.annotations = tool.annotations
  return identity
}
const catalogDigest = (tool) =>
  createHash("sha256")
    .update(canonical(catalogIdentity(tool)))
    .digest("hex")
const catalogRejection = (reason, tool) => ({
  code: "invalid-catalog",
  reason,
  tool: typeof tool === "string" && tool ? tool.slice(0, 64) : "",
})
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
    // Declarative (form) versus imperative (script). Kept beside the tool so the runtime snapshot,
    // and the digest an invocation is bound to, stay the qualified definition shape.
    this.toolKinds = new Map()
    // A rejected registration is named for the builder. It does not drop tools already accepted
    // and it does not mark the adapter unavailable: that path disconnects the pane.
    this.catalogRejection = null
    this.pending = new Map()
    this.closed = false
    this.available = false
    // The read whose element references the page may still act on; cleared with every document.
    this.readId = null
    this.interacting = false
    // The page operation currently running (only one at a time) and the ids the runtime
    // canceled while it ran. executeJavaScript cannot be aborted, so cancellation is
    // observed at the checkpoints around the destructive act and before a reply is built.
    this.activePageRequestId = null
    this.canceledPageRequests = new Set()
    this.message = (_event, method, params) => this.onMessage(method, params)
    this.navigation = (_event, _url, inPlace, mainFrame) => {
      // An in-place navigation (pushState, hash change) keeps the document and
      // its registered tools; Page.frameNavigated does not fire for it, so
      // clearing here left the agent's tool list empty until a full reload.
      if (mainFrame && !inPlace) this.invalidate()
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
    this.toolKinds.clear()
    this.catalogRejection = null
    this.revoke()
  }
  revoke({ cancelPageRequest = false } = {}) {
    this.generation = randomUUID()
    this.readId = null
    // Withdrawing access (pause, disconnect) also stops a read/act/wait that is already running: it cannot be aborted
    // mid-script, so marking it canceled stops it at the next checkpoint and an act still queued never clicks or types.
    // A navigation the act itself caused revokes too, but must not cancel that act.
    if (cancelPageRequest && this.activePageRequestId) this.canceledPageRequests.add(this.activePageRequestId)
    for (const id of [...this.pending.keys()]) this.cancel(id, "uncertain", "provider-gone")
    this.changed()
  }
  onMessage(method, params) {
    if (this.closed) return
    if (method === "Page.frameNavigated" && !params.frame.parentId) {
      this.frameId = params.frame.id
      this.invalidate()
    } else if (method === "WebMCP.toolsAdded") {
      // Hints on a tool are not read here. They never authorize a call.
      this.acceptTools(params && params.tools)
    } else if (method === "WebMCP.toolsRemoved") {
      if (!params || !Array.isArray(params.tools)) return
      for (const tool of params.tools) {
        if (tool && tool.frameId === this.frameId && typeof tool.name === "string") {
          this.tools.delete(tool.name)
          this.toolKinds.delete(tool.name)
        }
      }
      this.changed()
    } else if (method === "WebMCP.toolResponded") {
      // Keep early responses bounded without rejecting an unrelated invocation.
      const response =
        byteSize(params.output) > MAX_RESULT_BYTES
          ? { invocationId: params.invocationId, oversized: true }
          : { invocationId: params.invocationId, status: params.status, output: params.output }
      const pending = [...this.pending.values()].find((entry) => entry.invocationId === params.invocationId)
      if (pending) pending.finish(response)
      // Responses that race the invokeTool acknowledgement stay bounded on the active call.
      else for (const entry of this.pending.values()) if (!entry.invocationId) entry.early = response
    }
  }
  /**
   * Apply one toolsAdded batch, or name why it was rejected.
   * A repeated name is a replacement (the page re-registered that tool). Two copies of one name in the
   * same batch are ambiguous and the whole batch is refused. Refusal keeps every tool already accepted
   * and leaves the adapter available, so the pane stays connected and the builder can read the reason.
   */
  acceptTools(tools) {
    if (!Array.isArray(tools)) {
      this.catalogRejection = catalogRejection("invalid-schema", "")
      this.changed()
      return
    }
    const prepared = []
    const seen = new Set()
    for (const tool of tools) {
      if (!tool || typeof tool !== "object" || tool.frameId !== this.frameId) continue
      const name = tool.name
      if (typeof name !== "string" || !name) {
        this.catalogRejection = catalogRejection("invalid-name", "")
        this.changed()
        return
      }
      if (seen.has(name)) {
        this.catalogRejection = catalogRejection("duplicate-name", name)
        this.changed()
        return
      }
      seen.add(name)
      if (name.length > 256) {
        this.catalogRejection = catalogRejection("invalid-name", name)
        this.changed()
        return
      }
      if (typeof tool.description !== "string" || tool.description.length > 4096) {
        this.catalogRejection = catalogRejection("invalid-description", name)
        this.changed()
        return
      }
      if (tool.inputSchema !== undefined && tool.inputSchema !== null && !plainObject(tool.inputSchema)) {
        this.catalogRejection = catalogRejection("invalid-schema", name)
        this.changed()
        return
      }
      if (tool.annotations !== undefined && tool.annotations !== null && !plainObject(tool.annotations)) {
        this.catalogRejection = catalogRejection("invalid-schema", name)
        this.changed()
        return
      }
      const definition = {
        name,
        description: tool.description,
        frameId: tool.frameId,
        ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      }
      try {
        if (byteSize(definition) > 32768) {
          this.catalogRejection = catalogRejection("definition-too-large", name)
          this.changed()
          return
        }
        // Reject schemas that cannot be hashed (cycles, extreme nesting) before they reach an invocation.
        catalogDigest(definition)
      } catch {
        this.catalogRejection = catalogRejection("invalid-schema", name)
        this.changed()
        return
      }
      prepared.push({ definition, kind: Number.isInteger(tool.backendNodeId) ? "form" : "script" })
    }
    if (prepared.length === 0) return
    const next = new Map(this.tools)
    for (const entry of prepared) next.set(entry.definition.name, entry.definition)
    try {
      if (next.size > 128 || byteSize([...next.values()]) > 262144) {
        this.catalogRejection = catalogRejection("catalog-too-large", prepared[0].definition.name)
        this.changed()
        return
      }
    } catch {
      this.catalogRejection = catalogRejection("invalid-schema", prepared[0].definition.name)
      this.changed()
      return
    }
    for (const entry of prepared) {
      this.tools.set(entry.definition.name, entry.definition)
      this.toolKinds.set(entry.definition.name, entry.kind)
    }
    this.catalogRejection = null
    this.changed()
  }
  snapshot() {
    // A destroyed WebContents throws on getURL(); callers (e.g. the status
    // path) deliberately read a torn-down pane and must get a blank snapshot.
    const destroyed = typeof this.contents.isDestroyed === "function" && this.contents.isDestroyed()
    const origin = destroyed ? null : agentOrigin(this.contents.getURL())
    return {
      generation: this.generation,
      origin,
      frameId: this.frameId,
      tools: origin && this.available ? [...this.tools.values()] : [],
    }
  }
  async execute(request) {
    const snapshot = this.snapshot()
    if (request.deadline <= Date.now()) throw invocationError("timeout", "timeout")
    if (
      this.closed ||
      !this.available ||
      request.generation !== snapshot.generation ||
      request.origin !== snapshot.origin ||
      request.frameId !== snapshot.frameId
    ) {
      throw invocationError("failed", "page-changed")
    }
    if (request.operation === "list")
      return { requestID: request.requestID, generation: request.generation, status: "Completed", snapshot }
    if (["read", "act", "wait"].includes(request.operation)) return this.interact(request)
    if (request.operation !== "invoke" || this.pending.size !== 0 || this.interacting)
      throw invocationError("failed", "native-failure", "Native operation is unavailable")
    const tool = this.tools.get(request.toolName)
    if (!tool || definitionDigest(tool) !== request.digest) throw invocationError("failed", "definition-changed")
    if (!request.input || Array.isArray(request.input) || typeof request.input !== "object") {
      throw invocationError("failed", "invalid-input")
    }
    if (byteSize(request.input) > 65536) throw invocationError("failed", "input-too-large")
    return new Promise((resolve, reject) => {
      const finish = (result) => {
        clearTimeout(timer)
        this.pending.delete(request.requestID)
        const current = this.snapshot()
        if (
          this.closed ||
          current.generation !== request.generation ||
          current.origin !== request.origin ||
          !this.available
        ) {
          reject(invocationError("uncertain", "provider-gone"))
        } else if (definitionDigest(this.tools.get(request.toolName) ?? {}) !== request.digest) {
          reject(invocationError("failed", "definition-changed"))
        } else if (Date.now() >= request.deadline) {
          reject(invocationError("timeout", "timeout"))
        } else if (result.oversized || byteSize(result.output) > MAX_RESULT_BYTES) {
          reject(invocationError("failed", "result-too-large"))
        } else if (/^(canceled|cancelled|aborted)$/i.test(result.status)) {
          reject(invocationError("cancelled", "cancelled"))
        } else if (/^timeout$/i.test(result.status)) {
          reject(invocationError("timeout", "timeout"))
        } else if (/^(error|failed)$/i.test(result.status)) {
          reject(invocationError("application-error", "application-error"))
        } else if (result.status !== "Completed") {
          reject(invocationError("uncertain", "native-failure"))
        } else
          resolve({
            requestID: request.requestID,
            generation: request.generation,
            status: "Completed",
            output: result.output,
          })
      }
      const timer = setTimeout(
        () => this.cancel(request.requestID, "timeout", "timeout"),
        Math.min(30000, request.deadline - Date.now()),
      )
      const entry = {
        invocationId: null,
        early: null,
        finish,
        reject: (outcome = "uncertain", reason = "provider-gone") => {
          clearTimeout(timer)
          this.pending.delete(request.requestID)
          reject(invocationError(outcome, reason))
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
    this.activePageRequestId = typeof request.requestID === "string" ? request.requestID : null
    const assertActive = () => {
      if (request.requestID && this.canceledPageRequests.has(request.requestID)) {
        throw new Error("The browser request was canceled")
      }
    }
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
        assertActive()
        if (request.generation !== this.generation) throw new Error("The browser document changed")
        this.readId = readId
        return done(page.fit({ readId, ...result }))
      }
      if (request.operation === "wait") {
        const result = await run({ op: "wait", ...args })
        assertActive()
        if (request.generation !== this.generation) throw new Error("The browser document changed")
        return done(result)
      }
      if (args.readId !== this.readId) throw new Error("Element references are stale; read the page again")
      // Checked immediately before the act: a cancel that landed while the request was
      // queued must not still click/type on the page.
      assertActive()
      const result = await run({ op: "act", ...args })
      assertActive()
      if (result?.error) throw new Error(`The page refused the action: ${result.error}`)
      // Let a navigation the action started surface, so the reply carries the document it landed on.
      await new Promise((resolve) => setTimeout(resolve, 300))
      return done({ done: true, how: args.how, navigated: this.generation !== request.generation })
    } finally {
      this.interacting = false
      if (this.activePageRequestId === request.requestID) this.activePageRequestId = null
      if (request.requestID) this.canceledPageRequests.delete(request.requestID)
    }
  }
  cancel(requestID, outcome = "cancelled", reason = "cancelled") {
    // A page operation has no invocation id and cannot be aborted mid-script; record the
    // cancellation so the checkpoints above stop it and the reply is suppressed.
    if (typeof requestID === "string" && this.activePageRequestId === requestID) {
      this.canceledPageRequests.add(requestID)
      return
    }
    const pending = this.pending.get(requestID)
    if (!pending) return
    if (pending.invocationId)
      this.contents.debugger
        .sendCommand("WebMCP.cancelInvocation", { invocationId: pending.invocationId })
        .catch(() => {})
    pending.reject(outcome, reason)
  }
  close() {
    if (this.closed) return
    this.closed = true
    this.available = false
    for (const id of [...this.pending.keys()]) this.cancel(id, "uncertain", "provider-gone")
    this.contents.removeListener("did-start-navigation", this.navigation)
    this.contents.removeListener("render-process-gone", this.gone)
    this.contents.debugger.removeListener("message", this.message)
    this.contents.debugger.removeListener("detach", this.detached)
    if (this.contents.debugger.isAttached()) this.contents.debugger.detach()
  }
}

module.exports = {
  NativeWebMcp,
  definitionDigest,
  catalogDigest,
  CAPABILITY,
  agentOrigin,
  allowedUrl,
  pageKind,
  byteSize,
}
