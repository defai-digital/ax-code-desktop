"use strict"

const { webMcpDisplayText, webMcpDisplayReport } = require("../../../shared/webmcp-redaction.mjs")

const { canDiscardDocument, closeForEviction } = require("./browser-eviction")
const { manualToolResult, manualToolFailure } = require("./webmcp-manual-outcome")

const { createHash, randomBytes, randomUUID } = require("node:crypto")
const path = require("node:path")
const { projectKeyFor: projectKey, viewKeyFor: viewKey } = require("../../../shared/webmcp-view-key.mjs")
const {
  NativeWebMcp,
  CAPABILITY,
  agentOrigin,
  allowedUrl,
  pageKind,
  definitionDigest,
} = require("./native-webmcp")
const { projectToolCatalog, CATALOG_MAX_TOOLS, CATALOG_MAX_BYTES } = require("../../../shared/webmcp-catalog-projection.cjs")
const { DEFAULT_LOAD_URL_TIMEOUT_MS } = require("./load-url-timeout")

// This secret goes only to the supervised runtime child, never to a renderer or project config.
const DESKTOP_BROWSER_TOKEN = randomBytes(32).toString("base64url")

// Only fixed codes cross IPC; native messages can contain credentials and full URLs.
const REASON_CODES = new Set([
  "ERR_UNSAFE_PORT",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_CERT_AUTHORITY_INVALID",
  "ERR_CERT_DATE_INVALID",
  "ERR_ABORTED",
  "ERR_INVALID_URL",
])
function browserReason(error) {
  const code = typeof error?.code === "string" ? error.code : String(error?.message ?? "").match(/\bERR_[A-Z_]+\b/)?.[0]
  return REASON_CODES.has(code) ? code : "operation-failed"
}

const BROWSER_ACTIONS = Object.freeze([
  "capability",
  "create",
  "status",
  "close",
  "disconnect",
  "enable",
  "resume",
  "navigate",
  "tryTool",
  "reload",
  "bounds",
  "list",
  "show",
  "clearProject",
  "revokeSession",
  "pause",
  "focusOwner",
])

function createDesktopWebMcpBrowser({
  BrowserWindow,
  WebContentsView,
  session,
  getRuntime,
  getAuthorization,
  clientFactory,
  confirmClose = async () => false,
  recoverOwner = async () => null,
  providerToken = DESKTOP_BROWSER_TOKEN,
  loadTimeoutMs = DEFAULT_LOAD_URL_TIMEOUT_MS,
  attachTimeoutMs = 2000,
  maxLiveViews = 4,
  pollTimeoutMs = 20000,
  pollRetryMs = 1000,
}) {
  if (!Number.isInteger(maxLiveViews) || maxLiveViews < 1 || maxLiveViews > 8) {
    throw new Error("Browser pool limit must be between 1 and 8")
  }
  // A project/session owns one live view; opaque IDs remain the only renderer handle.
  const views = new Map()
  // Cross-window focus is permitted only for an owner disclosed to this sender.
  // Bind to the entry object so closing/recreating a view cannot inherit authority.
  const focusTargets = new WeakMap()
  function discloseOwner(sender, target) {
    const targets = focusTargets.get(sender) ?? new Set()
    if (targets.size >= 16) targets.delete(targets.values().next().value)
    targets.add(target)
    focusTargets.set(sender, targets)
    return target.id
  }
  // Unloaded addresses live only in this process. No page, provider, or tool reference survives.
  const unloaded = new Map()
  const unloadedOwners = new Map()
  function forget(record) {
    unloaded.delete(record.key)
    const group = unloadedOwners.get(record.sender)
    if (!group) return
    group.keys.delete(record.key)
    if (group.keys.size) return
    record.owner.removeListener("closed", group.onClosed)
    record.sender.removeListener("destroyed", group.onClosed)
    // Renderer loss keeps dormant addresses available after reload.
    unloadedOwners.delete(record.sender)
  }
  function remember(record) {
    let group = unloadedOwners.get(record.sender)
    if (!group) {
      group = {
        keys: new Set(),
        onClosed: () => {
          for (const key of [...group.keys]) forget(unloaded.get(key))
        },
      }
      unloadedOwners.set(record.sender, group)
      record.owner.on("closed", group.onClosed)
      record.sender.on("destroyed", group.onClosed)
      // Renderer loss is recoverable without discarding dormant addresses.
    }
    unloaded.set(record.key, record)
    group.keys.add(record.key)
    // Retain at most 32 addresses per window, evicting the oldest last-use first.
    const records = [...group.keys].map((key) => unloaded.get(key)).sort((a, b) => a.lastUsed - b.lastUsed)
    while (records.length > 32) forget(records.shift())
  }
  const idle = (entry) =>
    !entry.paused &&
    !entry.popups.size &&
    !entry.waiting &&
    !entry.activeRequests.size &&
    !entry.pendingLoads.size &&
    !entry.enrolling &&
    !entry.adapter?.pending.size &&
    !entry.adapter?.interacting
  async function unload(entry) {
    const record = {
      key: entry.key,
      id: entry.id,
      directory: entry.directory,
      sessionID: entry.sessionID,
      sender: entry.sender,
      owner: entry.owner,
      url: entry.contents.isDestroyed() ? "" : entry.contents.getURL(),
      origin: entry.adapter.snapshot().origin,
      lastUsed: entry.lastUsed,
    }
    if (!(await closeForEviction(entry.contents))) return false
    await close(entry)
    if (record.owner.isDestroyed() || record.sender.isDestroyed?.()) return
    remember(record)
    return true
  }
  const unloadedStatus = (record) => ({
    id: record.id,
    directory: record.directory,
    sessionID: record.sessionID,
    origin: record.origin ? webMcpDisplayText(record.origin) : null,
    lastUsed: record.lastUsed,
    unloaded: true,
    idle: true,
    visible: false,
    waiting: false,
    enabled: false,
    paused: false,
    nativeAvailable: false,
    tools: 0,
    catalog: [],
    generation: null,
    error: null,
  })
  const shown = new Map()
  const initializing = new Map()
  // Partitions whose guest session already has the hardened handlers attached.
  const guestSessions = new Set()
  // Profile ownership survives closing its last view, until the owning window dies.
  const profileOwners = new Map()
  // Diagnostic tracking only; serializePool prevents loading a half-cleared profile.
  const pendingGuestClears = new Map()
  // Track pending creates by owner; pool mutations are serialized across windows
  // so asynchronous native setup cannot exceed the live-view bound.
  const pendingCreates = new Map()
  let poolRevision = 0
  let poolOperations = Promise.resolve()
  const serializePool = (task) => {
    const operation = poolOperations.catch(() => {}).then(task)
    poolOperations = operation
    return operation
  }
  const partitionFor = (directory) =>
    `ax-coder-webmcp-${createHash("sha256").update(projectKey(directory)).digest("hex")}`
  let factory
  async function runtimeApi(directory, url, method = "GET", body, signal) {
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
      url,
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
  const api = (directory, url, method, body, signal) =>
    runtimeApi(directory, `/desktop/browser${url}`, method, body, signal)
  function lookup(sender, id) {
    const entry = [...views.values()].find((candidate) => candidate.id === id)
    if (!entry || entry.sender !== sender) throw new Error("This browser belongs to another window")
    return entry
  }
  // A command that acts on the pane's view: teardown destroys the webContents, which can land
  // while the command is being dispatched. `status()` reads a destroyed pane deliberately (it
  // reports a blank address), so only the acting commands check.
  function assertViewAlive(entry) {
    if (entry.closed || entry.contents.isDestroyed()) {
      throw new Error("The project browser is no longer available")
    }
  }
  const visible = (entry) =>
    !entry.closed &&
    entry.attached &&
    shown.get(entry.sender.id) === entry.key &&
    entry.owner?.isVisible() &&
    !entry.owner.isMinimized()
  function hide(entry) {
    if (entry.attached && entry.owner && !entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view)
    entry.attached = false
    // Visibility gates new requests only. Already executing work keeps its original deadline.
  }
  function show(entry) {
    assertViewAlive(entry)
    const previous = views.get(shown.get(entry.sender.id))
    if (previous && previous !== entry) hide(previous)
    shown.set(entry.sender.id, entry.key)
    entry.lastUsed = Date.now()
    // The first bounds comes from the pane; later shows reuse that view's own bounds.
    if (!initializing.has(entry.sender.id) && entry.bounds?.width && entry.bounds?.height) {
      if (!entry.attached) entry.owner.contentView.addChildView(entry.view)
      entry.view.setBounds(entry.bounds)
      entry.attached = true
    }
    if (visible(entry) && !entry.paused) entry.waiting?.wake()
  }
  const cancellationReply = (entry, connection, request, reason, state = "stopped") =>
    api(
      entry.directory,
      `/provider/${connection.providerID}/reply`,
      "POST",
      {
        requestID: request.requestID,
        generation: request.generation,
        status: "Error",
        output: { reason, cancellation: state },
      },
      AbortSignal.timeout(2000),
    ).catch(() => {})

  function cancellationSummary(results) {
    const cancellations = [...new Map(results.map((call) => [call.requestID, call])).values()]
    return {
      stoppedCalls: cancellations.filter((call) => call.state === "stopped").length,
      finishingCalls: cancellations.filter((call) => call.state === "still-finishing").length,
      cancellations,
    }
  }
  function stopAgentWork(entry, reason) {
    const work = [...entry.activeRequests.values()]
    // Withdraw admission synchronously; report completion only after the page acknowledgement.
    const stops = work.map((item) => item.cancel())
    const manual = [...entry.adapter.pending.keys()].filter(
      (id) => !work.some(({ request }) => request.requestID === id),
    )
    stops.push(...manual.map((id) => entry.adapter.cancel(id)))
    // Keep unfinished page scripts discoverable by later stops until their settlement cleanup.
    return Promise.all(stops).then(async (cancellations) => {
      await Promise.all(
        work.map(({ request, connection }, index) =>
          cancellationReply(entry, connection, request, reason, cancellations[index].state),
        ),
      )
      return cancellationSummary(cancellations)
    })
  }
  function closePopups(entry, confirmed = false) {
    for (const popup of entry.popups) {
      if (!popup.isDestroyed()) {
        if (confirmed) popup.destroy()
        else popup.close()
      }
    }
  }
  async function disconnect(entry) {
    entry.revision = (entry.revision ?? 0) + 1
    const connection = entry.connection
    const stopped = stopAgentWork(entry, "agent-disconnected")
    const held = entry.waiting?.request
    entry.connection = null
    entry.interrupted = false
    entry.paused = false
    entry.controller?.abort()
    entry.controller = null
    entry.waiting?.wake()
    const revoked = entry.adapter.revoke({ cancelPageRequest: true })
    const [result, revokedCancellations] = await Promise.all([
      stopped,
      revoked,
      connection && held ? cancellationReply(entry, connection, held, "agent-disconnected") : Promise.resolve(),
    ])
    // Teardown must not wait on a wedged runtime: quit and pane close both block
    // on this DELETE, and the default 20s timeout reads as a hang. The runtime
    // sweeps orphaned providers on its own, so a short bound is enough.
    if (connection)
      await api(
        entry.directory,
        `/provider/${connection.providerID}`,
        "DELETE",
        undefined,
        AbortSignal.timeout(2000),
      ).catch(() => {})
    // A held call that never ran is failed too, so it counts as stopped for the person's acknowledgement.
    return cancellationSummary([
      ...result.cancellations,
      ...revokedCancellations,
      ...(held ? [{ requestID: held.requestID, state: "stopped" }] : []),
    ])
  }
  async function pause(entry) {
    // Keep the provider and document so held requests remain bound to this session/page.
    entry.revision = (entry.revision ?? 0) + 1
    entry.paused = Boolean(entry.connection) || entry.paused || Boolean(entry.enrolling)
    const stopped = stopAgentWork(entry, "agent-paused")
    return stopped
  }

  const closeApprovals = new WeakMap()
  async function authorizeClose(sender, args, targets) {
    const documents = targets
      .flatMap((entry) => [
        { entry, contents: entry.contents, id: entry.id },
        ...[...entry.popups].map((popup, index) => ({
          entry,
          contents: popup.webContents,
          id: `${entry.id}:popup:${index}`,
        })),
      ])
      .filter(({ contents }) => !contents.isDestroyed())
    // Closing discards the view, regardless of its current URL or tool registrations.
    const identity = JSON.stringify(documents.map(({ contents, id }) => [id, contents.id]))
    const targetIdentity = JSON.stringify(targets.map((entry) => entry.id))
    const approval = closeApprovals.get(sender)
    closeApprovals.delete(sender)
    if (
      approval &&
      approval.token === args.closeConfirmation &&
      approval.action === args.action &&
      approval.targetIdentity === targetIdentity &&
      (approval.identity === identity || approval.reprompted)
    )
      return { approved: true }
    const risky = []
    for (const document of documents) {
      if (
        document.entry.possibleUnsavedWork ||
        !(await canDiscardDocument(document.contents)) ||
        document.entry.possibleUnsavedWork
      )
        risky.push(document)
    }
    if (!risky.length) return { approved: false }
    const token = randomUUID()
    closeApprovals.set(sender, {
      token,
      action: args.action,
      identity,
      targetIdentity,
      // A valid first confirmation permits only one further prompt for changed contents.
      reprompted: Boolean(approval && approval.token === args.closeConfirmation &&
        approval.action === args.action && approval.targetIdentity === targetIdentity),
    })
    return {
      confirmationRequired: true,
      closeConfirmation: token,
      pages: documents.map(({ entry, contents, id }) => ({
        id,
        sessionID: entry.sessionID,
        title: webMcpDisplayText(contents.getTitle?.() || pageKind(contents.getURL(), null)),
      })),
    }
  }
  function reveal(entry, select = true) {
    try {
      if (entry.owner && !entry.owner.isDestroyed()) {
        entry.owner.restore?.()
        entry.owner.show?.()
        if (select) show(entry)
        entry.owner.focus?.()
        if (select || shown.get(entry.sender.id) === entry.key) {
          entry.contents.focus?.()
          for (const popup of entry.popups) {
            if (!popup.isDestroyed()) {
              popup.show?.()
              popup.focus?.()
            }
          }
        }
      }
    } catch {
      // Native teardown can race focus. Retained entries remain available through the page switcher.
    }
  }
  async function close(entry, confirmed = false, onClosed = () => {}) {
    if (entry.closing) return entry.closing.then(onClosed)
    entry.closing = closeEntry(entry, confirmed, onClosed).finally(() => { entry.closing = null })
    return entry.closing
  }
  async function closeEntry(entry, confirmed, onClosed) {
    if (entry.closed) return onClosed()
    if (!confirmed) {
      // A handler can be installed after the probe. Preserve ownership and storage if Chromium vetoes.
      for (const contents of [...entry.popups].map((popup) => popup.webContents).concat(entry.contents)) {
        if (!(await closeForEviction(contents))) throw new Error("Browser page refused closure")
      }
    }
    entry.closed = true
    for (const abort of entry.loadAborts) abort()
    if (views.get(entry.key) === entry) views.delete(entry.key)
    if (shown.get(entry.sender.id) === entry.key) shown.delete(entry.sender.id)
    unbindOwner(entry)
    const disconnection = disconnect(entry)
    closePopups(entry, confirmed)
    entry.adapter.close()
    if (entry.owner && !entry.owner.isDestroyed()) entry.owner.contentView.removeChildView(entry.view)
    if (!entry.contents.isDestroyed()) entry.contents.close({ waitForBeforeUnload: !confirmed })
    // Other pages may proceed once closure is certain, without waiting for runtime revocation.
    onClosed()
    await disconnection
  }
  const ownerClosures = new WeakMap()
  function unbindOwner(entry) {
    if (!entry.owner) return
    const group = ownerClosures.get(entry.owner)
    group?.entries.delete(entry)
    if (group && !group.entries.size) {
      entry.owner.removeListener("close", group.onClose)
      ownerClosures.delete(entry.owner)
    }
    entry.owner.removeListener("closed", entry.onOwnerClosed)
    entry.owner.removeListener("hide", entry.onOwnerHidden)
    entry.owner.removeListener("minimize", entry.onOwnerHidden)
    entry.owner.removeListener("show", entry.onOwnerShown)
    entry.owner.removeListener("restore", entry.onOwnerShown)
    entry.sender.removeListener("destroyed", entry.onOwnerClosed)
    entry.sender.removeListener("render-process-gone", entry.onSenderGone)
  }
  function bindOwner(entry) {
    const { owner, sender } = entry
    let group = ownerClosures.get(owner)
    if (!group) {
      group = { entries: new Set(), pending: null }
      group.onClose = (event) => {
        // Electron close is synchronous: keep the owner alive until bounded authorization settles.
        event.preventDefault()
        if (group.pending) return
        group.pending = (async () => {
          await poolOperations.catch(() => {})
          // Keep the renderer-selected document alive until every other page has closed.
          const selected = views.get(shown.get(owner.webContents.id))
          const pages = [...group.entries].sort((a, b) => Number(a === selected) - Number(b === selected))
          for (const page of pages) await confirmAndClose(page)
          if (!owner.isDestroyed()) owner.close()
        })().catch(() => {
          // Prompts may concern a hidden session. Restore only the current renderer binding.
          const selected = views.get(shown.get(owner.webContents.id))
          if (selected && group.entries.has(selected) && !selected.closed) reveal(selected)
          else for (const page of group.entries) reveal(page, false)
        }).finally(() => { group.pending = null })
      }
      ownerClosures.set(owner, group)
      owner.on("close", group.onClose)
    }
    group.entries.add(entry)
    owner.on("closed", entry.onOwnerClosed)
    owner.on("hide", entry.onOwnerHidden)
    owner.on("minimize", entry.onOwnerHidden)
    owner.on("show", entry.onOwnerShown)
    owner.on("restore", entry.onOwnerShown)
    sender.on("destroyed", entry.onOwnerClosed)
    sender.on("render-process-gone", entry.onSenderGone)
  }
  function adopt(entry, owner, sender = owner.webContents) {
    if (entry.closed || !owner || owner.isDestroyed() || sender.isDestroyed?.()) return
    // Recovery grants control to one local owner; other windows still use disclosed focus handles.
    entry.owner = owner
    entry.sender = sender
    const partition = partitionFor(entry.directory)
    const owners = profileOwners.get(partition) ?? new Set()
    owners.add(sender)
    profileOwners.set(partition, owners)
    bindOwner(entry)
    for (const popup of entry.popups) {
      if (!popup.isDestroyed()) popup.setParentWindow?.(owner)
    }
    if (!shown.has(sender.id)) shown.set(sender.id, entry.key)
  }
  function ownerGone(entry) {
    if (entry.closed || !entry.owner) return
    hide(entry)
    unbindOwner(entry)
    if (shown.get(entry.sender.id) === entry.key) shown.delete(entry.sender.id)
    profileOwners.get(partitionFor(entry.directory))?.delete(entry.sender)
    entry.owner = null
    // No live page remains owned by a dead window. If recovery cannot create a window,
    // the next local browser list/create/focus adopts the retained page through the switcher.
    entry.recovery = close(entry).catch(async () => {
      await disconnect(entry)
      const owner = await recoverOwner()
      if (owner && !entry.owner) {
        adopt(entry, owner)
        reveal(entry)
      }
    }).catch(() => {
      // A failed recovery window must not become an unhandled event-listener rejection.
      // Keep the document and its opaque identity for the next local window's recovery.
    }).finally(() => { entry.recovery = null })
  }
  async function confirmAndClose(entry, authorized = () => {}) {
    if (entry.closed) return
    const owner = entry.owner
    const sender = entry.sender
    const sameOwner = () => owner && !owner.isDestroyed() && entry.owner === owner && entry.sender === sender && !sender.isDestroyed?.()
    if (!sameOwner()) throw new Error("The browser owner window is unavailable")
    const args = { action: "close" }
    let approval = await authorizeClose(sender, args, [entry])
    if (!sameOwner()) throw new Error("Browser ownership changed during closure")
    if (approval.confirmationRequired) {
      // Focusing the owner must not switch its native page behind another session's controls.
      reveal(entry, false)
      if (!(await confirmClose(owner, approval.pages))) throw new Error("Browser closure cancelled")
      if (!sameOwner()) throw new Error("Browser ownership changed during closure")
      approval = await authorizeClose(sender, { ...args, closeConfirmation: approval.closeConfirmation }, [entry])
      if (approval.confirmationRequired) {
        if (!(await confirmClose(owner, approval.pages, { closeAnyway: true }))) throw new Error("Browser closure cancelled")
        approval = { approved: true }
      }
    }
    if (!sameOwner()) throw new Error("Browser ownership changed during closure")
    await close(entry, approval.approved, authorized)
  }
  const status = (entry) => {
    const snapshot = entry.adapter.snapshot()
    const projected = projectToolCatalog(snapshot.tools, entry.adapter.toolKinds, entry.toolIdentities, snapshot.origin)
    // Shown in the pane's address bar; never logged.
    const url = entry.contents.isDestroyed() ? "" : entry.contents.getURL()
    return {
      id: entry.id,
      directory: entry.directory,
      sessionID: entry.sessionID,
      visible: visible(entry),
      waiting: Boolean(entry.waiting),
      waitingForSignIn: entry.popups.size > 0,
      lastUsed: entry.lastUsed,
      unloaded: false,
      idle: idle(entry),
      nativeAvailable: entry.adapter.available,
      enabled: Boolean(entry.connection) && !entry.paused && !entry.interrupted,
      interrupted: Boolean(entry.interrupted),
      paused: Boolean(entry.paused),
      error: entry.error ? webMcpDisplayText(entry.error) : null,
      origin: snapshot.origin ? webMcpDisplayText(snapshot.origin) : null,
      tools: snapshot.tools.length,
      catalog: projected.catalog,
      catalogTotal: projected.total,
      catalogTruncation: projected.truncation,
      catalogRejection: webMcpDisplayReport(entry.adapter.catalogRejection),
      generation: entry.adapter.generation,
      // Lets the renderer say whether the pane is blank or shows a page the agent cannot be granted.
      page: pageKind(url, snapshot.origin),
      url: webMcpDisplayText(url ?? ""),
    }
  }
  async function synchronize(entry) {
    const connection = entry.connection
    if (!connection) return
    try {
      await api(entry.directory, `/provider/${connection.providerID}/state`, "PUT", entry.adapter.snapshot())
    } catch {
      if (entry.connection === connection) {
        entry.error = "disconnected"
        await disconnect(entry)
      }
    }
  }
  // Promise completions identify their load; did-fail-load does not. In particular,
  // Chromium can emit an old ERR_ABORTED after the replacement page has loaded.
  async function loadPage(entry, url, signal) {
    if (signal?.aborted) throw new Error("Navigation canceled")
    const sequence = ++entry.loadSequence
    const contents = entry.contents
    entry.pendingLoads.add(sequence)
    entry.error = null
    let timer
    let abort
    try {
      await new Promise((resolve, reject) => {
        const stop = () => {
          if (sequence === entry.loadSequence && !contents.isDestroyed()) contents.stop()
        }
        abort = () => {
          stop()
          reject(new Error("Navigation canceled"))
        }
        signal?.addEventListener("abort", abort, { once: true })
        entry.loadAborts.add(abort)
        timer = setTimeout(() => {
          stop()
          reject(Object.assign(new Error("Navigation timed out"), { reason: "timeout" }))
        }, loadTimeoutMs)
        timer.unref?.()
        contents.loadURL(url).then(resolve, reject)
      })
      if (sequence === entry.loadSequence) entry.error = null
    } catch (error) {
      if (sequence === entry.loadSequence && !signal?.aborted) entry.error = browserReason(error)
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      entry.loadAborts.delete(abort)
      entry.pendingLoads.delete(sequence)
    }
  }
  /**
   * Serve one `navigate` request: load the URL the agent asked for, then report the
   * document the pane landed on. The runtime pushes the new snapshot through the
   * usual state channel first, so its reply check sees the page it will list next.
   */
  async function serveNavigation(entry, connection, request, canceled, signal) {
    if (signal.aborted || entry.connection !== connection || canceled.has(request.requestID)) return
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener("abort", abort, { once: true })
    entry.navigations.set(request.requestID, controller)
    const reply = async (payload) => {
      if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
      await api(entry.directory, `/provider/${connection.providerID}/reply`, "POST", payload, AbortSignal.any([signal, AbortSignal.timeout(2000)]))
    }
    try {
      // Revalidate after visibility/pause waits, immediately before starting the load.
      const document = entry.adapter.snapshot()
      if (
        entry.adapter.closed ||
        !entry.adapter.available ||
        request.generation !== document.generation ||
        request.origin !== document.origin ||
        request.frameId !== document.frameId
      )
        throw Object.assign(new Error("The browser document changed"), { reason: "page-changed" })
      // Agent-initiated navigation follows the runtime's own rule (https anywhere,
      // http only on loopback, no credentials); user-driven pane navigation keeps
      // the wider allowedUrl gate.
      if (typeof request.url !== "string" || !agentOrigin(request.url))
        throw Object.assign(new Error("Only ordinary web page URLs can be opened"), { reason: "invalid-input" })
      const before = entry.adapter.generation
      await loadPage(entry, request.url, controller.signal)
      if (controller.signal.aborted) return
      // The adapter observes the new document asynchronously; give it a brief
      // moment so the reply carries the generation the runtime will hold. The
      // listing that follows is its own round trip, so a short bound is enough and
      // a page that never reports a generation must not delay the reply.
      const deadline = Date.now() + 300
      while (!controller.signal.aborted && entry.adapter.generation === before && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      if (controller.signal.aborted) return
      const snapshot = entry.adapter.snapshot()
      await synchronize(entry)
      await reply({
        requestID: request.requestID,
        generation: snapshot.generation,
        status: "Completed",
        snapshot,
      })
    } catch (error) {
      await reply({
        requestID: request.requestID,
        generation: entry.adapter.snapshot().generation,
        status: "Error",
        output: {
          reason: ["invalid-input", "timeout", "page-changed"].includes(error?.reason)
            ? error.reason
            : "native-failure",
        },
      })
    } finally {
      signal.removeEventListener("abort", abort)
      if (entry.navigations.get(request.requestID) === controller) entry.navigations.delete(request.requestID)
    }
  }

  async function waitUntilVisible(entry, request, signal) {
    if (visible(entry) && !entry.paused && !entry.popups.size) return true
    await new Promise((resolve) => {
      const wake = () => resolve()
      const timer = setTimeout(wake, Math.max(0, request.deadline - Date.now()))
      timer.unref?.()
      entry.waiting = { wake, timer, request }
      signal.addEventListener("abort", wake, { once: true })
    }).finally(() => {
      clearTimeout(entry.waiting?.timer)
      if (entry.waiting) signal.removeEventListener("abort", entry.waiting.wake)
      entry.waiting = null
    })
    return !signal.aborted && visible(entry) && !entry.paused && !entry.popups.size && Date.now() < request.deadline
  }

  // The runtime normally answers an idle poll after 15s. Bound each HTTP attempt
  // independently of the enrollment lifetime, including transports that ignore abort.
  async function nextBatch(entry, connection, signal) {
    const attempt = new AbortController()
    let timer
    let abort
    try {
      return await new Promise((resolve, reject) => {
        abort = () => {
          attempt.abort()
          reject(new Error("Provider poll interrupted"))
        }
        if (signal.aborted) return abort()
        signal.addEventListener("abort", abort, { once: true })
        timer = setTimeout(abort, pollTimeoutMs)
        timer.unref?.()
        api(entry.directory, `/provider/${connection.providerID}/next`, "GET", undefined, attempt.signal).then(
          resolve,
          reject,
        )
      })
    } finally {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
    }
  }
  async function run(entry, connection, signal) {
    const canceled = new Set()
    let heldTask = null
    const dispatch = async (request) => {
      if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
      const wasHidden = !visible(entry)
      const wasPaused = entry.paused
      while (
        (!visible(entry) || entry.paused || entry.popups.size) &&
        Date.now() < request.deadline &&
        !signal.aborted &&
        entry.connection === connection &&
        !canceled.has(request.requestID)
      ) {
        await waitUntilVisible(entry, request, signal)
      }
      if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
      if (Date.now() >= request.deadline) {
        if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
        await api(
          entry.directory,
          `/provider/${connection.providerID}/reply`,
          "POST",
          {
            requestID: request.requestID,
            generation: request.generation,
            status: "Error",
            output: {
              reason: wasPaused
                ? "waiting-for-resume-timeout"
                : wasHidden
                  ? "waiting-for-visible-timeout"
                  : "request-deadline-exceeded",
            },
          },
          AbortSignal.any([signal, AbortSignal.timeout(2000)]),
        )
        return
      }
      // Awaiting visibility never transfers a request to the newly shown page.
      if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
      const work = {
        request,
        connection,
        cancel: () => {
          canceled.add(request.requestID)
          entry.navigations.get(request.requestID)?.abort()
          return entry.adapter.cancel(request.requestID)
        },
      }
      entry.activeRequests.set(request.requestID, work)
      const finished = () => {
        if (entry.activeRequests.get(request.requestID) === work) entry.activeRequests.delete(request.requestID)
      }
      // Navigation is not a native tool call: the pane owns the load, so the
      // bridge performs it and replies with the document it opened.
      if (request.operation === "navigate") {
        void serveNavigation(entry, connection, request, canceled, signal)
          .finally(finished)
          .catch(() => {
            if (!signal.aborted) void disconnect(entry)
          })
        return
      }
      if (request.operation === "act" || request.operation === "invoke") entry.possibleUnsavedWork = true
      // Invocation and polling run concurrently so abort can reach a waiting native form/tool.
      void entry.adapter
        .execute(request)
        .catch((error) => {
          // Only adapter-owned, allowlisted metadata crosses the bridge; exception text may contain secrets.
          const { outcome, reason } = manualToolFailure(error)
          return {
            requestID: request.requestID,
            generation: request.generation,
            status: "Error",
            output: { outcome, reason },
          }
        })
        .then(async (reply) => {
          finished()
          if (signal.aborted || entry.connection !== connection || canceled.delete(request.requestID)) return
          // An action can change the document; the runtime must hold that snapshot before the reply.
          if (request.operation === "act" && reply.generation !== request.generation) await synchronize(entry)
          return api(entry.directory, `/provider/${connection.providerID}/reply`, "POST", reply, AbortSignal.any([signal, AbortSignal.timeout(2000)]))
        })
        .catch(() => {
          if (!signal.aborted) void disconnect(entry)
        })
    }
    try {
      while (!signal.aborted && entry.connection === connection) {
        let batch
        try {
          batch = await nextBatch(entry, connection, signal)
        } catch (error) {
          if (signal.aborted || entry.connection !== connection) return
          const status = error?.status ?? error?.response?.status
          if (status >= 400 && status < 500) throw error
          entry.interrupted = true
          await new Promise((resolve) => {
            const finish = () => {
              clearTimeout(timer)
              signal.removeEventListener("abort", finish)
              resolve()
            }
            const timer = setTimeout(finish, pollRetryMs)
            timer.unref?.()
            signal.addEventListener("abort", finish, { once: true })
            if (signal.aborted) finish()
          })
          continue
        }
        // A poll may settle after its abort: never dispatch work from a retired provider.
        if (signal.aborted || entry.connection !== connection) return
        entry.interrupted = false
        for (const id of batch.canceled ?? []) {
          canceled.add(id)
          if (entry.waiting?.request.requestID === id) entry.waiting.wake()
          entry.navigations.get(id)?.abort()
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
          request.projectID !== entry.projectID ||
          request.sessionID !== entry.sessionID
        ) {
          throw new Error("Browser request identity mismatch")
        }
        if (canceled.delete(request.requestID)) continue
        if (!Number.isFinite(request.deadline)) throw new Error("Browser request requires a deadline")
        // The runtime allows one pending invocation, but polling must continue while it waits for visibility.
        // Cancellation can retire the held request before the runtime queues its replacement.
        if (entry.waiting && !canceled.has(entry.waiting.request.requestID)) {
          throw new Error("Provider sent concurrent held browser requests")
        }
        if (heldTask) await heldTask
        heldTask = dispatch(request).catch(async () => {
          if (!signal.aborted && entry.connection === connection) await disconnect(entry)
        })
      }
    } catch {
      if (entry.connection === connection) {
        entry.error = "disconnected"
        await disconnect(entry)
      }
    }
  }
  async function createView(args, sender, owner) {
    const key = viewKey(args.directory, args.sessionID)
    const existing = views.get(key)
    if (existing) {
      if (existing.sender !== sender)
        return { error: "owned-by-another-window", ownerId: discloseOwner(sender, existing) }
      return status(existing)
    }
    const remembered = unloaded.get(key)
    if (remembered && remembered.sender !== sender)
      return { error: "owned-by-another-window", ownerId: discloseOwner(sender, remembered) }
    if (views.size >= maxLiveViews) {
      const candidates = [...views.values()]
        .filter((entry) => entry.sender === sender && entry.ready && !visible(entry) && idle(entry))
        .sort((a, b) => a.lastUsed - b.lastUsed)
      let unloadedPage = false
      for (const candidate of candidates) {
        const generation = candidate.adapter.generation
        if (candidate.possibleUnsavedWork || !(await canDiscardDocument(candidate.contents))) continue
        // A call, navigation, or input may arrive while the asynchronous probe runs.
        if (
          candidate.possibleUnsavedWork ||
          !idle(candidate) ||
          visible(candidate) ||
          generation !== candidate.adapter.generation
        )
          continue
        if (await unload(candidate)) {
          unloadedPage = true
          break
        }
      }
      if (!unloadedPage) throw new Error("pool-full")
    }
    // Electron retains Session objects for the app lifetime. Reuse exactly one
    // hardened, in-memory profile per project, independent of its session count.
    // Closing a page does not sign the project out; only clearProject does.
    const partition = partitionFor(args.directory)
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
    const contents = view.webContents
    contents.on("will-navigate", (event, url) => {
      if (!allowedUrl(url)) event.preventDefault()
    })
    contents.on("will-redirect", (event, url) => {
      if (!allowedUrl(url)) event.preventDefault()
    })
    const entry = {
      toolIdentities: new Map(),
      id: remembered?.id ?? randomUUID(),
      key,
      projectKey: projectKey(args.directory),
      ready: false,
      lastUsed: Date.now(),
      sender,
      owner,
      view,
      contents,
      directory: projectKey(args.directory),
      sessionID: args.sessionID,
      paused: false,
      error: null,
      loadSequence: 0,
      pendingLoads: new Set(),
      loadAborts: new Set(),
      navigations: new Map(),
      activeRequests: new Map(),
      revision: 0,
      waiting: null,
      popups: new Set(),
      connection: null,
      controller: null,
      attached: false,
      syncing: Promise.resolve(),
    }
    // Only the person owns these windows: no preload, adapter, or provider enrollment.
    const popupPreferences = {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: undefined,
    }
    const popupUrlAllowed = (url) => /^https?:\/\//i.test(url) && allowedUrl(url)
    contents.setWindowOpenHandler(({ url }) => {
      if (entry.closed || !entry.owner || !popupUrlAllowed(url)) return { action: "deny" }
      return {
        action: "allow",
        createWindow: (options) => {
          if (entry.closed || !entry.owner) throw new Error("The browser is closed")
          const popup = new BrowserWindow({
            ...options,
            parent: entry.owner,
            webPreferences: popupPreferences,
          })
          entry.popups.add(popup)
          const contents = popup.webContents
          for (const event of ["before-input-event", "before-mouse-event"])
            contents.on(event, () => {
              entry.possibleUnsavedWork = true
            })
          contents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
            if (mainFrame && !inPlace) contents.desktopDocumentRevision = (contents.desktopDocumentRevision ?? 0) + 1
          })
          contents.setWindowOpenHandler(() => ({ action: "deny" }))
          for (const eventName of ["will-navigate", "will-redirect"]) {
            contents.on(eventName, (event, destination) => {
              if (!popupUrlAllowed(destination)) event.preventDefault()
            })
          }
          popup.once("closed", () => {
            entry.popups.delete(popup)
            if (!entry.popups.size) entry.waiting?.wake()
          })
          return contents
        },
      }
    })
    // Sticky for the lifetime of this view: even removing an editor after typing does not
    // establish that its draft was saved. Only the person can discard such a page.
    const protectWork = () => {
      entry.possibleUnsavedWork = true
    }
    contents.on("before-input-event", protectWork)
    contents.on("before-mouse-event", protectWork)
    contents.on("did-fail-load", (_event, _code, description, _url, isMainFrame) => {
      // Managed loads report through their sequenced promise. An uncorrelated
      // ERR_ABORTED event must never overwrite a newer page's result.
      if (isMainFrame && !entry.pendingLoads.has(entry.loadSequence) && description !== "ERR_ABORTED") {
        entry.error = browserReason({ code: description })
      }
    })
    contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace && !entry.pendingLoads.has(entry.loadSequence)) ++entry.loadSequence
    })
    contents.on("did-navigate", () => {
      if (
        !entry.pendingLoads.has(entry.loadSequence) &&
        (REASON_CODES.has(entry.error) || entry.error === "operation-failed")
      ) {
        entry.error = null
      }
    })
    entry.adapter = new NativeWebMcp(contents, () => {
      // A dead adapter (debugger detach or renderer crash) can no longer run a call,
      // so agent access must be revoked: syncing an empty catalog would leave the
      // runtime holding a live provider and turn every later call into an unconfirmed
      // timeout. A rejected catalog is not this case. The adapter stays available and
      // names the reason; tools already accepted remain. The connection check keeps
      // disconnect's own revoke (which re-enters here) from recursing.
      if (!entry.closed && !entry.adapter.available) {
        if (entry.connection) {
          entry.error = "disconnected"
          void disconnect(entry)
        }
        return
      }
      entry.syncing = entry.syncing.then(() => synchronize(entry))
    })
    entry.onOwnerClosed = () => ownerGone(entry)
    entry.onSenderGone = () => {
      // The host can reload while its window and unsaved guest remain alive.
      if (!entry.closed) pause(entry).catch(() => {})
    }
    entry.onOwnerHidden = () => {
      hide(entry)
    }
    entry.onOwnerShown = () => {
      if (shown.get(entry.sender.id) === entry.key && !entry.closed) show(entry)
    }
    views.set(key, entry)
    if (!shown.has(sender.id)) shown.set(sender.id, key)
    bindOwner(entry)
    const previous = views.get(shown.get(sender.id))
    try {
      // Attach a zero-sized view so Chromium creates its renderer before native CDP setup.
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      initializing.set(sender.id, key)
      if (previous?.attached) hide(previous)
      owner.contentView.addChildView(view)
      // A page that fails to load (server down, bad certificate) must not kill the
      // pane: closing the entry would leave the renderer without an id, so the
      // address bar and Go/Reload would stay inert and the failure would repeat on
      // every re-entry. The user can navigate somewhere else instead. A load that
      // never settles is treated the same way instead of hanging the pane's start
      // forever: without the deadline the renderer never receives an id and no
      // command it offers can be used.
      await loadPage(entry, remembered?.url || args.url).catch(() => {})
      if (entry.closed) throw new Error("Browser closed during loading")
      await entry.adapter.start({ timeoutMs: attachTimeoutMs })
      owner.contentView.removeChildView(view)
      entry.ready = true
    } catch (error) {
      await close(entry)
      throw new Error(`Native browser initialization failed: ${webMcpDisplayText(error instanceof Error ? error.message : "Unknown initialization failure")}`)
    } finally {
      initializing.delete(sender.id)
      const selected = views.get(shown.get(sender.id))
      if (selected && !selected.closed && !owner.isDestroyed()) show(selected)
    }
    // Pool operations are serialized: failed setup must not acquire profile ownership.
    const owners = profileOwners.get(partition) ?? new Set()
    owners.add(sender)
    profileOwners.set(partition, owners)
    if (remembered) forget(remembered)
    return status(entry)
  }
  async function command(sender, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid browser command")
    if (!BROWSER_ACTIONS.includes(args.action)) throw new Error("Native browser command is unavailable")
    const localOwner = BrowserWindow.fromWebContents(sender)
    if (localOwner && !localOwner.isDestroyed() && !sender.isDestroyed?.()) {
      for (const entry of views.values()) {
        if (entry.owner) continue
        await entry.recovery
        if (!entry.owner && !entry.closed) adopt(entry, localOwner, sender)
      }
    }
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
        compatible:
          !reachable || capability === null || browserMode === null
            ? null
            : capability === CAPABILITY && browserMode === "embedded",
      }
    }
    if (args.action === "create") {
      if (
        typeof args.directory !== "string" ||
        !path.isAbsolute(args.directory) ||
        args.directory.includes("\0") ||
        (args.sessionID !== null &&
          (typeof args.sessionID !== "string" || !/^ses_[A-Za-z0-9_-]{1,200}$/.test(args.sessionID))) ||
        !allowedUrl(args.url)
      ) {
        throw new Error("Select a coding session and a valid browser URL")
      }
      const owner = BrowserWindow.fromWebContents(sender)
      if (!owner) throw new Error("The browser requires a local desktop window")
      const revision = poolRevision
      const run = serializePool(() => {
        if (revision !== poolRevision || owner.isDestroyed() || sender.isDestroyed?.()) {
          throw new Error("The browser window is no longer available")
        }
        if (ownerClosures.get(owner)?.pending) throw new Error("The browser owner window is closing")
        return createView(args, sender, owner)
      })
      pendingCreates.set(sender.id, run)
      try {
        return await run
      } finally {
        if (pendingCreates.get(sender.id) === run) pendingCreates.delete(sender.id)
      }
    }
    if (args.action === "clearProject") {
      if (typeof args.directory !== "string" || !path.isAbsolute(args.directory) || args.directory.includes("\0")) {
        throw new Error("Select a project before clearing browser storage")
      }
      if (!BrowserWindow.fromWebContents(sender)) throw new Error("The browser requires a local desktop window")
      const directory = projectKey(args.directory)
      const partition = partitionFor(directory)
      const clearing = serializePool(async () => {
        const owners = profileOwners.get(partition)
        for (const owner of owners ?? []) {
          if (
            owner.isDestroyed?.() ||
            !BrowserWindow.fromWebContents(owner) ||
            BrowserWindow.fromWebContents(owner).isDestroyed()
          )
            owners.delete(owner)
        }
        const targets = [...views.values()].filter((entry) => entry.projectKey === projectKey(directory))
        if (
          !owners?.has(sender) ||
          [...owners].some((owner) => owner !== sender) ||
          targets.some((entry) => entry.sender !== sender)
        )
          throw new Error("This browser storage belongs to another window")
        const dormant = [...unloaded.values()].filter((entry) => entry.directory === directory)
        if (dormant.some((entry) => entry.sender !== sender)) throw new Error("This browser belongs to another window")
        const confirmation = await authorizeClose(sender, args, targets)
        if (confirmation.confirmationRequired) return confirmation
        const affected = [...targets, ...dormant].map(({ id, directory, sessionID }) => ({ id, directory, sessionID }))
        const notify = (error) => {
          if (!sender.isDestroyed?.())
            sender.send("ax-code:dom-event", {
              event: "openchamber:webmcp-storage",
              detail: { views: affected, error },
            })
        }
        notify("storage-clearing")
        try {
          dormant.forEach(forget)
          await Promise.all(targets.map((entry) => close(entry, confirmation.approved)))
          if (guestSessions.has(partition)) await session.fromPartition(partition).clearStorageData()
          notify("storage-cleared")
          return { cleared: true }
        } catch (error) {
          notify("operation-failed")
          throw error
        }
      })
      pendingGuestClears.set(partition, clearing)
      try {
        return await clearing
      } finally {
        if (pendingGuestClears.get(partition) === clearing) pendingGuestClears.delete(partition)
      }
    }
    if (args.action === "revokeSession") {
      if (
        typeof args.directory !== "string" ||
        !path.isAbsolute(args.directory) ||
        args.directory.includes("\0") ||
        typeof args.sessionID !== "string" ||
        !/^ses_[A-Za-z0-9_-]{1,200}$/.test(args.sessionID)
      ) {
        throw new Error("Select a coding session before revoking browser access")
      }
      if (!BrowserWindow.fromWebContents(sender)) throw new Error("The browser requires a local desktop window")
      return (async () => {
        const dormant = unloaded.get(viewKey(args.directory, args.sessionID))
        if (dormant && dormant.sender !== sender) throw new Error("This browser belongs to another window")
        const target = views.get(viewKey(args.directory, args.sessionID))
        if (target) {
          lookup(sender, target.id)
          target.paused = false
          return { revoked: true, ...(await disconnect(target)) }
        }
        return { revoked: true, stoppedCalls: 0, finishingCalls: 0, cancellations: [] }
      })()
    }
    if (args.action === "focusOwner") {
      if (!BrowserWindow.fromWebContents(sender)) throw new Error("The browser requires a local desktop window")
      const target = [...views.values(), ...unloaded.values()].find((entry) => entry.id === args.id)
      if (!target || !target.owner || target.owner.isDestroyed()) throw new Error("The browser owner window is unavailable")
      if (target.sender !== sender && !focusTargets.get(sender)?.has(target))
        throw new Error("This browser belongs to another window")
      if (target.owner.isMinimized()) target.owner.restore()
      target.owner.show()
      target.owner.focus()
      return { focused: true }
    }
    if (args.action === "list") {
      if (!BrowserWindow.fromWebContents(sender)) throw new Error("The browser requires a local desktop window")
      return {
        maxLiveViews,
        liveViews: views.size,
        otherWindows: [
          ...new Set([...views.values()].filter((entry) => entry.owner && entry.sender !== sender).map((entry) => entry.owner)),
        ]
          .map((owner) => {
            const pages = [...views.values()].filter((entry) => entry.owner === owner && entry.ready)
            return { id: pages[0] ? discloseOwner(sender, pages[0]) : undefined, pageCount: pages.length }
          })
          .filter((owner) => owner.id),
        views: [
          ...[...views.values()].filter((entry) => entry.sender === sender && entry.ready).map(status),
          ...[...unloaded.values()].filter((entry) => entry.sender === sender).map(unloadedStatus),
        ],
      }
    }
    const dormant = [...unloaded.values()].find((entry) => entry.id === args.id)
    if (dormant) {
      if (dormant.sender !== sender) throw new Error("This browser belongs to another window")
      if (args.sessionID !== undefined && args.sessionID !== dormant.sessionID)
        throw new Error("Browser session mismatch")
      if (args.directory !== undefined && projectKey(args.directory) !== dormant.directory)
        throw new Error("Browser project mismatch")
      if (args.action === "status") return unloadedStatus(dormant)
      if (args.action === "close") {
        forget(dormant)
        return { closed: true }
      }
      if (args.action === "show")
        return serializePool(async () => {
          if (unloaded.get(dormant.key) !== dormant || dormant.owner.isDestroyed() || sender.isDestroyed?.())
            throw new Error("The project browser is no longer available")
          await createView({ ...dormant, url: dormant.url || "about:blank" }, sender, dormant.owner)
          const entry = lookup(sender, args.id)
          show(entry)
          return status(entry)
        })
      throw new Error("The project browser is unloaded")
    }
    const entry = lookup(sender, args.id)
    if (args.sessionID !== undefined && args.sessionID !== entry.sessionID) throw new Error("Browser session mismatch")
    if (args.directory !== undefined && projectKey(args.directory) !== entry.projectKey)
      throw new Error("Browser project mismatch")
    if (args.action === "show") {
      show(entry)
      return status(entry)
    }
    if (args.action === "status") return status(entry)
    if (args.action === "close") {
      const confirmation = await authorizeClose(sender, args, [entry])
      if (confirmation.confirmationRequired) return confirmation
      await close(entry, confirmation.approved)
      return { closed: true }
    }
    if (args.action === "pause") {
      const stopped = await pause(entry)
      return { ...status(entry), ...stopped }
    }
    if (args.action === "disconnect") {
      const stopped = await disconnect(entry)
      return { ...status(entry), ...stopped }
    }
    if ((args.action === "resume" || args.action === "enable") && entry.connection) {
      const connection = entry.connection
      const revision = entry.revision
      const capability = await api(entry.directory, "/capability")
      if (entry.connection !== connection || entry.revision !== revision) return status(entry)
      if (capability?.capability !== CAPABILITY || capability?.browserMode !== "embedded") {
        entry.error = "runtime-incompatible"
        return { ...status(entry), reason: "runtime-incompatible" }
      }
      entry.paused = false
      entry.error = null
      entry.waiting?.wake()
      return status(entry)
    }
    if (args.action === "enable" || args.action === "resume") {
      let reason = "enable-failed"
      const enrollment = Symbol("enrollment")
      entry.enrolling = enrollment
      try {
        if (!entry.sessionID) {
          reason = "session-required"
          throw new Error("Select a coding session before enabling agent access")
        }
        // The view attaches on its first non-empty bounds, a frame or two after the pane reports ready,
        // and a transient dialog sends empty bounds. An enable click in that window used to fail outright
        // and read as a runtime refusal, so wait briefly for the pane to be shown before giving up.
        const shown = () => !entry.closed && entry.attached && entry.owner?.isVisible() && !entry.owner.isMinimized()
        // A disconnect or runtime change while waiting revokes this request; it must not re-enable access.
        const requested = entry.revision
        for (const deadline = Date.now() + attachTimeoutMs; !shown() && Date.now() < deadline; ) {
          await new Promise((resolve) => setTimeout(resolve, 50))
          if (entry.revision !== requested) throw new Error("Browser access changed during enrollment")
        }
        if (!shown()) throw new Error("The project browser must be visible before enabling agent access")
        const disconnection = disconnect(entry)
        const revision = entry.revision
        await disconnection
        const active = () =>
          !entry.closed &&
          entry.attached &&
          // A dead adapter (detached debugger, crashed renderer) enrolls a
          // connection whose every later call fails on a stale lifetime.
          entry.adapter.available &&
          entry.owner?.isVisible() &&
          !entry.owner.isMinimized() &&
          entry.revision === revision
        if (!active()) throw new Error("Browser access changed during enrollment")
        const capability = await api(entry.directory, "/capability")
        if (capability?.capability == null || capability?.browserMode == null)
          throw new Error("Browser compatibility has not been reported")
        if (capability?.capability !== CAPABILITY || capability?.browserMode !== "embedded") {
          reason = "runtime-incompatible"
          throw new Error("The bundled coding runtime needs a compatible browser update")
        }
        await entry.syncing
        if (!active()) throw new Error("Browser access changed during enrollment")
        // Resolve the session from the authenticated runtime rather than trusting
        // the renderer-supplied pair. Session.directory is the exact coding workspace.
        const codingSession = await runtimeApi(entry.directory, `/session/${entry.sessionID}`)
        if (
          codingSession?.id !== entry.sessionID ||
          typeof codingSession.directory !== "string" ||
          projectKey(codingSession.directory) !== entry.projectKey ||
          typeof codingSession.projectID !== "string" ||
          !codingSession.projectID ||
          !active()
        ) {
          throw new Error("Browser session does not belong to this project")
        }
        entry.projectID = codingSession.projectID
        const connection = await api(entry.directory, "/provider", "POST", {
          sessionID: entry.sessionID,
          snapshot: entry.adapter.snapshot(),
        })
        if (!active() || connection.projectID !== entry.projectID) {
          await api(entry.directory, `/provider/${connection.providerID}`, "DELETE").catch(() => {})
          throw new Error("Browser access changed during enrollment")
        }
        entry.paused = false
        entry.error = null
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
      } catch {
        if (entry.enrolling === enrollment) entry.error = reason
        return { ...status(entry), reason }
      } finally {
        if (entry.enrolling === enrollment) entry.enrolling = false
      }
    }
    if (args.action === "navigate") {
      assertViewAlive(entry)
      if (!allowedUrl(args.url)) {
        entry.error = "ERR_INVALID_URL"
        return status(entry)
      }
      // Same deadline as the first load: a load that never settles would otherwise
      // leave the pane busy forever, with every toolbar command disabled.
      await loadPage(entry, args.url).catch(() => {})
      return status(entry)
    }
    if (args.action === "tryTool") {
      // The user invoking a page tool from Desktop, as they could from the page itself. It needs no agent access, creates
      // no grant and is never replayed; the adapter applies the same generation, origin, frame, definition and input checks
      // as an agent invocation. Results go back to this renderer only and are not logged.
      assertViewAlive(entry)
      const snapshot = entry.adapter.snapshot()
      const tool = snapshot.tools.find((candidate) =>
        entry.toolIdentities.get(JSON.stringify([snapshot.origin, candidate.name]))?.invocationID === args.toolName)
      if (
        !snapshot.origin ||
        !args.generation ||
        !args.definitionDigest ||
        args.origin !== snapshot.origin ||
        args.generation !== snapshot.generation ||
        !tool ||
        args.definitionDigest !== definitionDigest(tool)
      )
        return { ok: false, outcome: "stale-form", reason: "page-changed" }
      try {
        entry.possibleUnsavedWork = true
        const result = await entry.adapter.execute({
          operation: "invoke",
          requestID: randomUUID(),
          generation: args.generation,
          origin: args.origin,
          frameId: snapshot.frameId,
          toolName: tool.name,
          digest: args.definitionDigest,
          input: args.input,
          deadline: Date.now() + 30000,
        })
        const classified = manualToolResult(result)
        return { ...classified, output: webMcpDisplayReport(classified.output) }
      } catch (error) {
        if (error?.outcome === "failed" && ["page-changed", "definition-changed"].includes(error.reason))
          return { ok: false, outcome: "stale-form", reason: error.reason }
        return manualToolFailure(error)
      }
    }
    if (args.action === "reload") {
      assertViewAlive(entry)
      ++entry.loadSequence
      entry.error = null
      entry.contents.reload()
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
      entry.bounds = bounds
      if (bounds.width && bounds.height && shown.get(sender.id) === entry.key && !initializing.has(sender.id)) {
        if (!entry.attached) {
          entry.owner.contentView.addChildView(entry.view)
          entry.attached = true
        }
        entry.view.setBounds(bounds)
        if (visible(entry) && !entry.paused) entry.waiting?.wake()
      } else if (entry.attached) {
        hide(entry)
      }
      return status(entry)
    }
    throw new Error("Native browser command is unavailable")
  }
  return {
    command,
    // Bounded lifecycle counters for deterministic leak checks; never exposed over IPC.
    poolStats: () => ({
      liveViews: views.size,
      shownWindows: shown.size,
      pendingCreates: pendingCreates.size,
      pendingGuestClears: pendingGuestClears.size,
      initializing: initializing.size,
      partitions: guestSessions.size,
    }),
    closeAll: async () => {
      ++poolRevision
      for (const record of unloaded.values()) forget(record)
      const refused = []
      const processed = new Set()
      const approvals = new Map()
      const cancelledOwners = new WeakSet()
      const closeEntries = () => Promise.all(
        [...views.values()].filter((entry) => !processed.has(entry))
          .sort((a, b) => Number(shown.get(a.sender.id) === a.key) - Number(shown.get(b.sender.id) === b.key))
          .map(async (entry) => {
            processed.add(entry)
            const previous = approvals.get(entry.sender) ?? Promise.resolve()
            let release
            approvals.set(entry.sender, new Promise((resolve) => { release = resolve }))
            await previous
            try {
              await entry.recovery
              if (cancelledOwners.has(entry.sender)) throw new Error("Browser closure cancelled")
              await confirmAndClose(entry, release)
            } catch {
              release()
              cancelledOwners.add(entry.sender)
              refused.push(entry.id)
              reveal(entry, shown.get(entry.sender.id) === entry.key)
            }
          }),
      )
      const closing = closeEntries()
      await poolOperations.catch(() => {})
      await Promise.all([closing, closeEntries()])
      for (const record of unloaded.values()) forget(record)
      return refused
    },
    runtimeChanged: () => {
      for (const entry of views.values()) {
        entry.error = "disconnected"
        void disconnect(entry)
      }
    },
  }
}

module.exports = {
  createDesktopWebMcpBrowser,
  DESKTOP_BROWSER_TOKEN,
  BROWSER_ACTIONS,
  projectToolCatalog,
  CATALOG_MAX_TOOLS,
  CATALOG_MAX_BYTES,
}
