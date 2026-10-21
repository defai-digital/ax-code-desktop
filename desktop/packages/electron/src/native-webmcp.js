"use strict"

const { redactWebMcpText } = require("../../../shared/webmcp-redaction.mjs")
const { randomUUID } = require("node:crypto")
const page = require("./webmcp-page")
const { definitionDigest, catalogDigest } = require("../../../shared/webmcp-digests.cjs")

const CAPABILITY = "desktop.webmcp.v1"
const MAX_RESULT_BYTES = 65536
const STOP_ACK_MS = 500
const boundedStop = async (acknowledged, requestID) => {
  let timer
  try {
    const stopped = await Promise.race([
      acknowledged.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), STOP_ACK_MS)
      }),
    ])
    return { requestID, state: stopped ? "stopped" : "still-finishing" }
  } finally {
    clearTimeout(timer)
  }
}
// Fixed metadata only: page exceptions and debugger errors may contain credentials.
const invocationError = (outcome, reason, message = "Native completion is unconfirmed; do not retry automatically") =>
  Object.assign(new Error(message), { outcome, reason })
const byteSize = (value) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8")
const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const catalogRejection = (reason, tool) => ({
  code: "invalid-catalog",
  reason,
  tool: typeof tool === "string" && tool ? redactWebMcpText(tool).slice(0, 64) : "",
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
    this.revocationId = randomUUID()
    this.frameId = ""
    this.tools = new Map()
    // Declarative (form) versus imperative (script). Kept beside the tool so the runtime snapshot,
    // and the digest an invocation is bound to, stay the qualified definition shape.
    this.toolKinds = new Map()
    // Rejections retire affected definitions while leaving unrelated tools and the pane available.
    this.catalogRejection = null
    this.pending = new Map()
    this.closed = false
    this.available = false
    // The read whose element references the page may still act on; cleared with every document.
    this.readId = null
    this.interacting = false
    // Keep the operation occupied until the page settles, including after a stop acknowledgement timeout.
    this.activePageRequestId = null
    // Enrollment revocation changes generation without replacing the executing document.
    this.documentId = randomUUID()
    this.executingPageScript = null
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
    this.documentId = randomUUID()
    this.retirePageOperation?.()
    this.tools.clear()
    this.toolKinds.clear()
    this.catalogRejection = null
    // Navigation can discard an invocation without a response. Retire only these old-document
    // entries after the bounded stop; a withdrawal on the same document must keep its busy guard.
    const retiring = [...this.pending.entries()]
    void this.revoke().then(() => {
      for (const [id, entry] of retiring) if (this.pending.get(id) === entry) entry.reject()
    })
  }
  revoke({ cancelPageRequest = false } = {}) {
    this.generation = randomUUID()
    this.revocationId = randomUUID()
    this.readId = null
    const ids = [...this.pending.keys()]
    if (cancelPageRequest && this.activePageRequestId) ids.push(this.activePageRequestId)
    const stopped = Promise.all(ids.map((id) => this.cancel(id, "uncertain", "provider-gone")))
    this.changed()
    return stopped
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
      this.retireDefinitions(params?.tools)
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
  // Retire the entire affected batch before validation: a rejection anywhere in a batch must
  // not leave an earlier or later replacement authorized by its previous definition.
  retireDefinitions(tools) {
    const unknown =
      !Array.isArray(tools) ||
      tools.some(
        (tool) =>
          !tool ||
          typeof tool !== "object" ||
          typeof tool.frameId !== "string" ||
          !tool.frameId ||
          (tool.frameId === this.frameId && (typeof tool.name !== "string" || !tool.name)),
      )
    const names = unknown
      ? [...this.tools.keys()]
      : tools.filter((tool) => tool.frameId === this.frameId).map((tool) => tool.name)
    let retired = false
    for (const name of names) {
      retired = this.tools.delete(name) || retired
      this.toolKinds.delete(name)
    }
    // Even re-registering the same digest cannot revive a previously approved request.
    // Already dispatched calls retain their completion identity until enrollment/document revocation.
    if (retired) this.generation = randomUUID()
  }
  /**
   * Apply one toolsAdded batch, or name why it was rejected.
   * A repeated name is a replacement (the page re-registered that tool). Two copies of one name in the
   * same batch are ambiguous and the whole batch is refused. Refusal retires affected tools but
   * leaves unrelated tools available, so the builder can read the reason without disconnecting.
   */
  acceptTools(tools) {
    this.retireDefinitions(tools)
    if (!Array.isArray(tools) || tools.some((tool) => !tool || typeof tool.frameId !== "string" || !tool.frameId)) {
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
    if (
      !tool ||
      tool.frameId !== request.frameId ||
      tool.name !== request.toolName ||
      definitionDigest(tool) !== request.digest
    )
      throw invocationError("failed", "definition-changed")
    if (!request.input || Array.isArray(request.input) || typeof request.input !== "object") {
      throw invocationError("failed", "invalid-input")
    }
    if (byteSize(request.input) > 65536) throw invocationError("failed", "input-too-large")
    const revocationId = this.revocationId
    return new Promise((resolve, reject) => {
      const finish = (result) => {
        clearTimeout(timer)
        this.pending.delete(request.requestID)
        entry.acknowledge()
        if (entry.stopping) {
          reject(invocationError(entry.stopOutcome, entry.stopReason))
          return
        }
        const current = this.snapshot()
        if (this.closed || this.revocationId !== revocationId || current.origin !== request.origin || !this.available) {
          reject(invocationError("uncertain", "provider-gone"))
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
      let acknowledge
      const acknowledged = new Promise((resolve) => {
        acknowledge = resolve
      })
      const entry = {
        acknowledged,
        acknowledge,
        clearDeadline: () => clearTimeout(timer),
        invocationId: null,
        early: null,
        finish,
        reject: (outcome = "uncertain", reason = "provider-gone", retain = false) => {
          clearTimeout(timer)
          if (!retain) this.pending.delete(request.requestID)
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
          if (entry.stopping || !this.pending.has(request.requestID)) {
            void this.contents.debugger.sendCommand("WebMCP.cancelInvocation", { invocationId }).catch(() => {})
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
    let acknowledge
    this.pageAcknowledged = new Promise((resolve) => {
      acknowledge = resolve
    })
    this.pageStop = null
    const documentId = this.documentId
    let scriptPending = false
    let expired = false
    let released = false
    const release = () => {
      if (released) return
      released = true
      acknowledge()
      this.interacting = false
      this.activePageRequestId = null
      this.executingPageScript = null
      this.retirePageOperation = null
      if (request.requestID) this.canceledPageRequests.delete(request.requestID)
    }
    // An unacknowledged script on the same document still owns the busy guard. Navigation
    // retires that document; a late settlement must never clear a newer operation's state.
    this.retirePageOperation = () => {
      if (expired && this.documentId !== documentId) release()
    }
    let timer
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => {
          expired = true
          this.readId = null
          void this.cancel(request.requestID, "timeout", "timeout")
          reject(invocationError("timeout", "timeout"))
        },
        Math.max(0, Math.min(30000, request.deadline - Date.now())),
      )
    })
    const assertActive = () => {
      if (request.requestID && this.canceledPageRequests.has(request.requestID)) {
        throw new Error("The browser request was canceled")
      }
    }
    try {
      const run = async (payload) => {
        this.executingPageScript = { requestID: request.requestID, documentId: this.documentId }
        scriptPending = true
        const script = this.contents.executeJavaScriptInIsolatedWorld(page.WORLD_ID, [{ code: page.program(payload) }])
        const settled = () => {
          scriptPending = false
          if (expired) release()
        }
        // Observe both late outcomes even after the deadline has rejected the caller.
        void script.then(settled, settled)
        const result = await Promise.race([script, deadline])
        this.executingPageScript = null
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
      await Promise.race([new Promise((resolve) => setTimeout(resolve, 300)), deadline])
      assertActive()
      return done({ done: true, how: args.how, navigated: this.generation !== request.generation })
    } finally {
      clearTimeout(timer)
      if (!expired || !scriptPending || this.documentId !== documentId) release()
    }
  }
  cancel(requestID, outcome = "cancelled", reason = "cancelled") {
    if (typeof requestID === "string" && this.activePageRequestId === requestID) {
      this.canceledPageRequests.add(requestID)
      if (!this.pageStop) {
        // The interrupt targets the isolate, so never send it during the post-script delay
        // or after navigation has replaced the document that owns the executing script.
        if (
          this.executingPageScript?.requestID === requestID &&
          this.executingPageScript.documentId === this.documentId
        ) {
          void this.contents.debugger.sendCommand("Runtime.terminateExecution").catch(() => {})
        }
        this.pageStop = boundedStop(this.pageAcknowledged, requestID)
      }
      return this.pageStop
    }
    const pending = this.pending.get(requestID)
    if (!pending) return Promise.resolve({ requestID, state: "stopped" })
    if (pending.stopping) return pending.stopping
    pending.clearDeadline()
    pending.stopOutcome = outcome
    pending.stopReason = reason
    pending.stopping = boundedStop(pending.acknowledged, requestID).then((result) => {
      // Keep the entry until its real response: a timeout must not admit overlapping page work.
      if (result.state === "still-finishing") {
        pending.reject(outcome === "timeout" ? "timeout" : "uncertain", reason, true)
      }
      return result
    })
    if (pending.invocationId)
      void this.contents.debugger
        .sendCommand("WebMCP.cancelInvocation", { invocationId: pending.invocationId })
        .catch(() => {})
    return pending.stopping
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
