"use strict"

const { randomBytes, randomUUID } = require("node:crypto")
const path = require("node:path")
const { NativeWebMcp, CAPABILITY, agentOrigin, allowedUrl, pageKind } = require("./native-webmcp")
const { loadUrlWithTimeout, DEFAULT_LOAD_URL_TIMEOUT_MS } = require("./load-url-timeout")

// This secret goes only to the supervised runtime child, never to a renderer or project config.
const DESKTOP_BROWSER_TOKEN = randomBytes(32).toString("base64url")

function createDesktopWebMcpBrowser({
  BrowserWindow,
  WebContentsView,
  session,
  getRuntime,
  getAuthorization,
  clientFactory,
  providerToken = DESKTOP_BROWSER_TOKEN,
  loadTimeoutMs = DEFAULT_LOAD_URL_TIMEOUT_MS,
}) {
  const views = new Map()
  // Partitions whose guest session already has the hardened handlers attached.
  const guestSessions = new Set()
  // window partition -> in-flight storage clear, so a new pane never loads into a
  // half-cleared profile.
  const pendingGuestClears = new Map()
  // sender id -> in-flight create. Two concurrent creates for the same sender
  // would both pass the `views.has` check before either reaches `views.set`,
  // and the loser's WebContentsView would stay attached but untracked until the
  // window closes. Serialize them instead.
  const pendingCreates = new Map()
  let factory
  async function api(directory, url, method = "GET", body, signal) {
    const origin = getRuntime()
    const target = origin && new URL(origin)
    if (
      !target ||
      target.protocol !== "http:" ||
      target.hostname !== "127.0.0.1" ||
      target.username ||
      target.password ||
      target.pathname !== "/" ||
      target.search ||
      target.hash
    ) {
      throw new Error("The local coding runtime is unavailable")
    }
    factory ??= clientFactory ? clientFactory : (await import("@defai-digital/ax-code-sdk/v2/gen/client")).createClient
    const client = factory({
      baseUrl: origin,
      headers: {
        Authorization: getAuthorization(),
        "x-ax-desktop-browser-token": providerToken,
        "Content-Type": "application/json",
      },
    })
    return client.request({
      url: `/desktop/browser${url}`,
      method,
      query: { directory },
      body,
      bodySerializer: (value) => JSON.stringify(value),
      responseStyle: "data",
      throwOnError: true,
      redirect: "error",
      signal: signal ?? AbortSignal.timeout(20000),
    })
  }
  function lookup(sender, id) {
    const entry = views.get(sender.id)
    if (!entry || entry.id !== id || entry.sender !== sender) throw new Error("This browser belongs to another window")
    return entry
  }
  async function disconnect(entry) {
    entry.revision = (entry.revision ?? 0) + 1
    const connection = entry.connection
    entry.connection = null
    entry.controller?.abort()
    entry.controller = null
    entry.adapter.revoke()
    // Teardown must not wait on a wedged runtime: quit and pane close both block
    // on this DELETE, and the default 20s timeout reads as a hang. The runtime
    // sweeps orphaned providers on its own, so a short bound is enough.
    if (connection)
      await api(entry.directory, `/provider/${connection.providerID}`, "DELETE", undefined, AbortSignal.timeout(2000)).catch(() => {})
  }
  async function close(entry) {
    if (entry.closed) return
    entry.closed = true
    if (views.get(entry.sender.id) === entry) views.delete(entry.sender.id)
    entry.owner.removeListener("closed", entry.onOwnerClosed)
    entry.owner.removeListener("hide", entry.onOwnerHidden)
    entry.owner.removeListener("minimize", entry.onOwnerHidden)
    entry.sender.removeListener("destroyed", entry.onOwnerClosed)
    entry.sender.removeListener("render-process-gone", entry.onOwnerClosed)
    const disconnection = disconnect(entry)
    entry.adapter.close()
    if (!entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view)
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close({ waitForBeforeUnload: false })
    // Wipe cookies, caches and storage so the reused per-window partition behaves
    // like the fresh one this pane used to get.
    const partition = `ax-coder-webmcp-${entry.sender.id}`
    const clearing = (async () => {
      try {
        await session.fromPartition(partition).clearStorageData()
      } catch {
        // Best-effort: a failed clear only leaves data for the next pane.
      }
    })().finally(() => {
      if (pendingGuestClears.get(partition) === clearing) {
        pendingGuestClears.delete(partition)
      }
    })
    pendingGuestClears.set(partition, clearing)
    await disconnection
  }
  const status = (entry) => {
    const snapshot = entry.adapter.snapshot()
    // Shown in the pane's address bar; never logged.
    const url = entry.view.webContents.isDestroyed() ? "" : entry.view.webContents.getURL()
    return {
      id: entry.id,
      nativeAvailable: entry.adapter.available,
      enabled: Boolean(entry.connection),
      origin: snapshot.origin,
      tools: snapshot.tools.length,
      generation: entry.adapter.generation,
      // Lets the renderer say whether the pane is blank or shows a page the agent cannot be granted.
      page: pageKind(url, snapshot.origin),
      url,
    }
  }
  async function synchronize(entry) {
    const connection = entry.connection
    if (!connection) return
    try {
      await api(entry.directory, `/provider/${connection.providerID}/state`, "PUT", entry.adapter.snapshot())
    } catch {
      if (entry.connection === connection) await disconnect(entry)
    }
  }
  /**
   * Serve one `navigate` request: load the URL the agent asked for, then report the
   * document the pane landed on. The runtime pushes the new snapshot through the
   * usual state channel first, so its reply check sees the page it will list next.
   */
  async function serveNavigation(entry, connection, request, canceled, signal) {
    const reply = async (payload) => {
      if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
      await api(entry.directory, `/provider/${connection.providerID}/reply`, "POST", payload, signal)
    }
    try {
      // Agent-initiated navigation follows the runtime's own rule (https anywhere,
      // http only on loopback, no credentials); user-driven pane navigation keeps
      // the wider allowedUrl gate.
      if (typeof request.url !== "string" || !agentOrigin(request.url))
        throw new Error("Only ordinary web page URLs can be opened")
      const before = entry.adapter.generation
      await loadUrlWithTimeout(entry.view.webContents, request.url, { timeoutMs: loadTimeoutMs })
      // The adapter observes the new document asynchronously; give it a brief
      // moment so the reply carries the generation the runtime will hold. The
      // listing that follows is its own round trip, so a short bound is enough and
      // a page that never reports a generation must not delay the reply.
      const deadline = Date.now() + 300
      while (entry.adapter.generation === before && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      const snapshot = entry.adapter.snapshot()
      await synchronize(entry)
      await reply({
        requestID: request.requestID,
        generation: snapshot.generation,
        status: "Completed",
        snapshot,
      })
    } catch {
      await reply({
        requestID: request.requestID,
        generation: entry.adapter.snapshot().generation,
        status: "Error",
      })
    }
  }

  async function run(entry, connection, signal) {
    const canceled = new Set()
    try {
      while (!signal.aborted && entry.connection === connection) {
        const batch = await api(entry.directory, `/provider/${connection.providerID}/next`, "GET", undefined, signal)
        for (const id of batch.canceled ?? []) {
          canceled.add(id)
          entry.adapter.cancel(id)
        }
        // At most one native invocation is active; retain only a bounded late-completion window.
        while (canceled.size > 128) canceled.delete(canceled.values().next().value)
        const request = batch.request
        if (!request) continue
        // Peer-generated IDs bind the target; the renderer never sees this channel.
        if (
          request.providerID !== connection.providerID ||
          request.epoch !== connection.epoch ||
          request.projectID !== connection.projectID ||
          request.sessionID !== entry.sessionID
        ) {
          throw new Error("Browser request identity mismatch")
        }
        // Navigation is not a native tool call: the pane owns the load, so the
        // bridge performs it and replies with the document it opened.
        if (request.operation === "navigate") {
          void serveNavigation(entry, connection, request, canceled, signal).catch(() => {
            if (!signal.aborted) void disconnect(entry)
          })
          continue
        }
        // Invocation and polling run concurrently so abort can reach a waiting native form/tool.
        void entry.adapter
          .execute(request)
          .catch(() => ({ requestID: request.requestID, generation: request.generation, status: "Error" }))
          .then(async (reply) => {
            if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
            // An action can change the document; the runtime must hold that snapshot before the reply.
            if (request.operation === "act" && reply.generation !== request.generation) await synchronize(entry)
            return api(entry.directory, `/provider/${connection.providerID}/reply`, "POST", reply, signal)
          })
          .catch(() => {
            if (!signal.aborted) void disconnect(entry)
          })
      }
    } catch {
      if (entry.connection === connection) await disconnect(entry)
    }
  }
  async function createView(args, sender, owner) {
    if (views.has(sender.id)) await close(views.get(sender.id))
    // One stable, in-memory partition per window instead of a fresh UUID per open:
    // Electron caches a Session per partition string and offers no way to destroy
    // one, so a UUID per open leaked a session (cookie jar, caches, network
    // context) for every pane the user ever opened. `close()` clears the storage
    // again, so a new pane still starts from a clean profile.
    const partition = `ax-coder-webmcp-${sender.id}`
    await (pendingGuestClears.get(partition) ?? Promise.resolve())
    const guestSession = session.fromPartition(partition)
    if (!guestSessions.has(partition)) {
      guestSessions.add(partition)
      guestSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      guestSession.setPermissionCheckHandler(() => false)
      guestSession.on("will-download", (event) => event.preventDefault())
    }
    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    })
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    view.webContents.on("will-navigate", (event, url) => {
      if (!allowedUrl(url)) event.preventDefault()
    })
    view.webContents.on("will-redirect", (event, url) => {
      if (!allowedUrl(url)) event.preventDefault()
    })
    const entry = {
      id: randomUUID(),
      sender,
      owner,
      view,
      directory: args.directory,
      sessionID: args.sessionID,
      connection: null,
      controller: null,
      attached: false,
      syncing: Promise.resolve(),
    }
    entry.adapter = new NativeWebMcp(view.webContents, () => {
      // A dead adapter (debugger detach, renderer crash, unusable catalog) can no
      // longer run a single call, so agent access must be revoked: syncing an
      // empty catalog would leave the runtime holding a live provider and turn
      // every later call into an unconfirmed timeout. The connection check keeps
      // disconnect's own revoke (which re-enters here) from recursing.
      if (!entry.closed && !entry.adapter.available) {
        if (entry.connection) void disconnect(entry)
        return
      }
      entry.syncing = entry.syncing.then(() => synchronize(entry))
    })
    entry.onOwnerClosed = () => {
      void close(entry)
    }
    entry.onOwnerHidden = () => {
      void disconnect(entry)
    }
    views.set(sender.id, entry)
    owner.on("closed", entry.onOwnerClosed)
    owner.on("hide", entry.onOwnerHidden)
    owner.on("minimize", entry.onOwnerHidden)
    sender.on("destroyed", entry.onOwnerClosed)
    sender.on("render-process-gone", entry.onOwnerClosed)
    try {
      // Attach a zero-sized view so Chromium creates its renderer before native CDP setup.
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      owner.contentView.addChildView(view)
      // A page that fails to load (server down, bad certificate) must not kill the
      // pane: closing the entry would leave the renderer without an id, so the
      // address bar and Go/Reload would stay inert and the failure would repeat on
      // every re-entry. The user can navigate somewhere else instead. A load that
      // never settles is treated the same way instead of hanging the pane's start
      // forever: without the deadline the renderer never receives an id and no
      // command it offers can be used.
      await loadUrlWithTimeout(view.webContents, args.url, { timeoutMs: loadTimeoutMs }).catch(() => {})
      if (entry.closed) throw new Error("Browser closed during loading")
      await entry.adapter.start()
      owner.contentView.removeChildView(view)
    } catch {
      await close(entry)
      throw new Error("The native browser could not load this page")
    }
    return status(entry)
  }
  async function command(sender, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid browser command")
    if (args.action === "capability") {
      // A read-only compatibility probe so the UI can explain an old runtime before any browser exists.
      if (typeof args.directory !== "string" || !path.isAbsolute(args.directory) || args.directory.includes("\0")) {
        throw new Error("Select a project before checking browser compatibility")
      }
      if (!BrowserWindow.fromWebContents(sender)) throw new Error("The browser requires a local desktop window")
      let capability = null
      let browserMode = null
      let reachable = true
      try {
        const response = await api(args.directory, "/capability")
        capability = response?.capability ?? null
        browserMode = response?.browserMode ?? null
      } catch {
        // A runtime that is restarting or offline is unknown, not incompatible.
        reachable = false
      }
      return {
        capability: CAPABILITY,
        runtimeCapability: capability,
        browserMode,
        reachable,
        compatible: capability === CAPABILITY && browserMode === "embedded",
      }
    }
    if (args.action === "create") {
      if (
        typeof args.directory !== "string" ||
        !path.isAbsolute(args.directory) ||
        args.directory.includes("\0") ||
        typeof args.sessionID !== "string" ||
        !/^ses_[A-Za-z0-9_-]+$/.test(args.sessionID) ||
        !allowedUrl(args.url)
      ) {
        throw new Error("Select a coding session and a valid browser URL")
      }
      const owner = BrowserWindow.fromWebContents(sender)
      if (!owner) throw new Error("The browser requires a local desktop window")
      const run = (pendingCreates.get(sender.id) ?? Promise.resolve())
        .catch(() => {})
        .then(() => createView(args, sender, owner))
      pendingCreates.set(sender.id, run)
      try {
        return await run
      } finally {
        if (pendingCreates.get(sender.id) === run) pendingCreates.delete(sender.id)
      }
    }
    const entry = lookup(sender, args.id)
    if (args.action === "status") return status(entry)
    if (args.action === "close") {
      await close(entry)
      return { closed: true }
    }
    if (args.action === "disconnect") {
      await disconnect(entry)
      return status(entry)
    }
    if (args.action === "enable") {
      if (!entry.attached || !entry.owner.isVisible() || entry.owner.isMinimized()) {
        throw new Error("The project browser must be visible before enabling agent access")
      }
      const disconnection = disconnect(entry)
      const revision = entry.revision
      await disconnection
      const active = () =>
        !entry.closed &&
        entry.attached &&
        entry.owner.isVisible() &&
        !entry.owner.isMinimized() &&
        entry.revision === revision
      if (!active()) throw new Error("Browser access changed during enrollment")
      const capability = await api(entry.directory, "/capability")
      if (capability?.capability !== CAPABILITY || capability?.browserMode !== "embedded")
        throw new Error("The bundled coding runtime needs a compatible browser update")
      await entry.syncing
      if (!active()) throw new Error("Browser access changed during enrollment")
      const connection = await api(entry.directory, "/provider", "POST", {
        sessionID: entry.sessionID,
        snapshot: entry.adapter.snapshot(),
      })
      if (!active()) {
        await api(entry.directory, `/provider/${connection.providerID}`, "DELETE").catch(() => {})
        throw new Error("Browser access changed during enrollment")
      }
      entry.connection = connection
      entry.controller = new AbortController()
      void run(entry, connection, entry.controller.signal)
      // Reconcile once: a tool or navigation change that landed between the
      // enrollment POST and the connection being recorded was dropped by
      // synchronize, which only pushes state while a connection exists. Without
      // this the runtime keeps the catalog from the POST while the adapter has
      // moved on, and every call fails until the page changes again.
      await synchronize(entry)
      return status(entry)
    }
    if (args.action === "navigate") {
      if (!allowedUrl(args.url)) throw new Error("Only ordinary web page URLs are supported")
      // Same deadline as the first load: a load that never settles would otherwise
      // leave the pane busy forever, with every toolbar command disabled.
      await loadUrlWithTimeout(entry.view.webContents, args.url, { timeoutMs: loadTimeoutMs })
      return status(entry)
    }
    if (args.action === "reload") {
      entry.view.webContents.reload()
      return status(entry)
    }
    if (args.action === "bounds") {
      const { x, y, width, height } = args
      if (![x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
        throw new Error("Invalid native browser bounds")
      }
      const container = entry.owner.getContentBounds()
      const zoom = sender.getZoomFactor()
      const left = Math.min(container.width, Math.round(x * zoom))
      const top = Math.min(container.height, Math.round(y * zoom))
      const bounds = {
        x: left,
        y: top,
        width: Math.max(0, Math.min(container.width - left, Math.round(width * zoom))),
        height: Math.max(0, Math.min(container.height - top, Math.round(height * zoom))),
      }
      if (bounds.width && bounds.height) {
        if (!entry.attached) {
          entry.owner.contentView.addChildView(entry.view)
          entry.attached = true
        }
        entry.view.setBounds(bounds)
      } else if (entry.attached) {
        entry.owner.contentView.removeChildView(entry.view)
        entry.attached = false
        await disconnect(entry)
      }
      return status(entry)
    }
    throw new Error("Native browser command is unavailable")
  }
  return {
    command,
    closeAll: async () => {
      await Promise.allSettled([...views.values()].map(close))
    },
    runtimeChanged: () => {
      for (const entry of views.values()) void disconnect(entry)
    },
  }
}

module.exports = { createDesktopWebMcpBrowser, DESKTOP_BROWSER_TOKEN }
