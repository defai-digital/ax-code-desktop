import { afterEach, describe, expect, test, vi } from "vitest"
import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { createDesktopWebMcpBrowser, projectToolCatalog } from "./desktop-webmcp-browser.js"

const { catalogDigest, definitionDigest } = createRequire(import.meta.url)("./native-webmcp.js")

const controllers = []
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((controller) => controller.closeAll()))
})

function fixture({
  capability = "desktop.webmcp.v1",
  browserMode = "embedded",
  holdRevocation = false,
  loadError = null,
  attachTimeoutMs = 200,
  loadTimeoutMs = 20,
  sessionDirectory = null,
  maxLiveViews = 4,
  pollTimeoutMs,
  pollRetryMs,
  nextPoll,
} = {}) {
  const owners = new Map()
  const guests = []
  const revocations = []
  const partitions = new Map()
  let provider = 0
  // Set by a test before a load to model a guest whose loadURL never settles: a
  // server that accepts TCP and never answers would leave the pane starting
  // forever without the load deadline.
  let hangLoad = false
  class View {
    constructor(options) {
      this.webContents = new EventEmitter()
      const contents = this.webContents
      contents.partition = options.webPreferences.partition
      contents.destroyed = false
      contents.isDestroyed = () => contents.destroyed
      contents.close = () => {
        contents.destroyed = true
      }
      // Electron throws from the object itself once it is destroyed.
      contents.reload = vi.fn(() => {
        if (contents.destroyed) throw new Error("Object has been destroyed")
      })
      contents.stop = vi.fn()
      contents.setWindowOpenHandler = vi.fn()
      contents.loadedUrls = []
      contents.loadURL = async (url) => {
        if (loadError) throw loadError
        if (hangLoad) return new Promise(() => {})
        contents.url = url
        contents.loadedUrls.push(url)
      }
      contents.getURL = () => contents.url
      contents.debugger = new EventEmitter()
      contents.debugger.attach = vi.fn()
      contents.debugger.detach = vi.fn()
      contents.debugger.isAttached = () => false
      contents.debugger.sendCommand = async (method) =>
        method === "Page.getFrameTree" ? { frameTree: { frame: { id: "top" } } } : {}
      guests.push(contents)
    }
    setBounds() {}
  }
  const requests = []
  // The provider stream hands the bridge one request per poll; a test can push a
  // request before or after the stream starts.
  const streams = new Map()
  const streamFor = (providerID) => {
    if (!streams.has(providerID)) streams.set(providerID, { requests: [], waiters: [] })
    return streams.get(providerID)
  }
  const pushStreamRequest = (request, transportProvider) => {
    const stream = streamFor(
      transportProvider ?? request.providerID ?? request.batch?.request?.providerID ?? "provider-1",
    )
    const waiter = stream.waiters.shift()
    if (waiter) waiter(request)
    else stream.requests.push(request)
  }
  const nextStreamRequest = (providerID, signal) =>
    new Promise((resolve, reject) => {
      const stream = streamFor(providerID)
      const queued = stream.requests.shift()
      if (queued) {
        resolve(queued)
        return
      }
      const abort = () => {
        const index = stream.waiters.indexOf(waiter)
        if (index >= 0) stream.waiters.splice(index, 1)
        reject(new Error("aborted"))
      }
      const waiter = (request) => {
        signal?.removeEventListener("abort", abort)
        resolve(request)
      }
      stream.waiters.push(waiter)
      signal?.addEventListener("abort", abort, { once: true })
    })
  const controller = createDesktopWebMcpBrowser({
    BrowserWindow: { fromWebContents: (sender) => owners.get(sender) },
    WebContentsView: View,
    // Short deadline so the hang tests stay fast.
    loadTimeoutMs,
    attachTimeoutMs,
    maxLiveViews,
    pollTimeoutMs,
    pollRetryMs,
    session: {
      fromPartition: (partition) => {
        if (!partitions.has(partition))
          partitions.set(
            partition,
            Object.assign(new EventEmitter(), {
              setPermissionRequestHandler: vi.fn(),
              setPermissionCheckHandler: vi.fn(),
              clearStorageData: vi.fn(async () => {}),
            }),
          )
        return partitions.get(partition)
      },
    },
    getRuntime: () => "http://127.0.0.1:31418",
    getAuthorization: () => "Basic fixture",
    providerToken: "fixture-only-token",
    clientFactory: () => ({
      request: (request) => {
        requests.push(request)
        if (request.url.startsWith("/session/"))
          return Promise.resolve({
            id: request.url.split("/").at(-1),
            directory: sessionDirectory ?? request.query.directory,
            projectID: "project",
          })
        if (request.url.endsWith("/capability")) return Promise.resolve({ capability, browserMode })
        if (request.url.endsWith("/provider"))
          return Promise.resolve({
            providerID: `provider-${++provider}`,
            epoch: "boot",
            projectID: "project",
          })
        if (request.url.endsWith("/next") && nextPoll) return nextPoll(request)
        if (request.url.endsWith("/next"))
          return nextStreamRequest(request.url.split("/").at(-2), request.signal).then(
            (next) => next.batch ?? { request: next, canceled: [] },
          )
        if (request.method === "DELETE" && holdRevocation) return new Promise((resolve) => revocations.push(resolve))
        return Promise.resolve({})
      },
    }),
  })
  controllers.push(controller)
  const create = async ({
    attach = true,
    sessionID = owners.size ? `ses_fixture${owners.size}` : "ses_fixture",
  } = {}) => {
    const sender = Object.assign(new EventEmitter(), { id: owners.size + 1, getZoomFactor: () => 1, send: vi.fn() })
    const owner = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      getContentBounds: () => ({ width: 800, height: 600 }),
      contentView: {
        children: new Set(),
        addChildView(view) {
          this.children.add(view)
          expect(this.children.size).toBeLessThanOrEqual(1)
        },
        removeChildView(view) {
          this.children.delete(view)
        },
      },
    })
    owners.set(sender, owner)
    const status = await controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID,
      url: "https://example.com/",
    })
    if (attach)
      await controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 800, height: 600 })
    return { sender, status }
  }
  return {
    controller,
    partitions,
    create,
    requests,
    pushStreamRequest,
    guests,
    revocations,
    owners,
    setCapability: (value) => {
      capability = value
    },
    hangLoads: (value) => {
      hangLoad = value
    },
  }
}

const navigateRequest = (overrides = {}) => ({
  providerID: "provider-1",
  epoch: "boot",
  projectID: "project",
  sessionID: "ses_fixture",
  generation: "generation-1",
  origin: null,
  frameId: "",
  requestID: "req-navigate",
  operation: "navigate",
  deadline: Date.now() + 30000,
  url: "https://example.org/flights",
  ...overrides,
})

const replies = (f) => f.requests.filter((request) => request.url.endsWith("/reply"))

describe("desktop WebMCP navigation requests", () => {
  test("does not load a navigation canceled in the dispatch batch", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    const guest = f.guests[0]
    const load = vi.spyOn(guest, "loadURL")
    const polls = f.requests.filter((r) => r.url.endsWith("/next")).length
    f.pushStreamRequest({ batch: { request: navigateRequest(), canceled: ["req-navigate"] } })
    await vi.waitFor(() => expect(f.requests.filter((r) => r.url.endsWith("/next")).length).toBeGreaterThan(polls))
    expect(load).not.toHaveBeenCalled()
    expect(f.requests.some((r) => r.url.endsWith("/reply"))).toBe(false)
  })

  test.each(["pause", "disconnect", "revokeSession", "cancel"])(
    "stops an in-flight agent load on %s without replay",
    async (action) => {
      const f = fixture({ loadTimeoutMs: 1000 })
      const { sender, status } = await f.create()
      await f.controller.command(sender, { action: "enable", id: status.id })
      const guest = f.guests[0]
      let finish
      guest.loadURL = vi.fn(
        (url) =>
          new Promise((resolve, reject) => {
            let stopped = false
            guest.stop.mockImplementation(() => {
              stopped = true
              reject(Object.assign(new Error("aborted"), { code: "ERR_ABORTED" }))
            })
            finish = () => {
              if (!stopped) {
                guest.url = url
                guest.loadedUrls.push(url)
              }
              resolve()
            }
          }),
      )
      f.pushStreamRequest(navigateRequest())
      await vi.waitFor(() => expect(guest.loadURL).toHaveBeenCalledTimes(1))
      if (action === "revokeSession") {
        await f.controller.command(sender, { action, directory: "/tmp/project", sessionID: "ses_fixture" })
      } else if (action !== "cancel") {
        await f.controller.command(sender, { action, id: status.id })
      } else {
        const polls = f.requests.filter((r) => r.url.endsWith("/next")).length
        f.pushStreamRequest({ batch: { canceled: ["req-navigate"] } })
        await vi.waitFor(() => expect(f.requests.filter((r) => r.url.endsWith("/next")).length).toBeGreaterThan(polls))
      }
      expect(guest.stop).toHaveBeenCalledTimes(1)
      finish()
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(guest.getURL()).toBe("https://example.com/")
      if (action === "cancel") expect(replies(f)).toHaveLength(0)
      else
        expect(replies(f).map((r) => r.body)).toEqual([
          expect.objectContaining({
            requestID: "req-navigate",
            status: "Error",
            output: expect.objectContaining({ reason: action === "pause" ? "agent-paused" : "agent-disconnected" }),
          }),
        ])
      if (action === "pause") {
        await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 100, height: 100 })
        await f.controller.command(sender, { action: "resume", id: status.id })
      }
      expect(guest.loadURL).toHaveBeenCalledTimes(1)
    },
  )

  test("canceling a superseded agent load does not stop the newer user navigation", async () => {
    const f = fixture({ loadTimeoutMs: 1000 })
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    const guest = f.guests[0]
    let finishUser
    guest.loadURL = vi.fn(
      (url) =>
        new Promise((resolve) => {
          if (url === "https://user.test/") finishUser = resolve
        }),
    )
    f.pushStreamRequest(navigateRequest())
    await vi.waitFor(() => expect(guest.loadURL).toHaveBeenCalledTimes(1))
    const userLoad = f.controller.command(sender, { action: "navigate", id: status.id, url: "https://user.test/" })
    await f.controller.command(sender, { action: "pause", id: status.id })
    expect(guest.stop).not.toHaveBeenCalled()
    finishUser()
    await userLoad
  })

  test("an agent navigation superseding Go leaves the healthy page free of ERR_ABORTED", async () => {
    const f = fixture({ loadTimeoutMs: 1000 })
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    const guest = f.guests[0]
    let rejectGo
    guest.loadURL = vi.fn((url) => {
      if (url === "https://user.test/")
        return new Promise((_resolve, reject) => {
          rejectGo = reject
        })
      guest.url = url
      guest.emit("did-navigate", {}, url)
      guest.debugger.emit("message", {}, "Page.frameNavigated", { frame: { id: "top" } })
      return Promise.resolve()
    })
    const go = f.controller.command(sender, { action: "navigate", id: status.id, url: "https://user.test/" })
    f.pushStreamRequest(navigateRequest())
    await vi.waitFor(() => expect(f.requests.some((r) => r.url.endsWith("/reply"))).toBe(true))
    guest.emit("did-fail-load", {}, -3, "ERR_ABORTED", "https://user.test/", true)
    rejectGo(Object.assign(new Error("superseded"), { code: "ERR_ABORTED" }))
    expect(await go).toMatchObject({ error: null, url: "https://example.org/flights" })
  })

  test("a superseded load cannot write or clear the latest load error", async () => {
    const f = fixture({ loadTimeoutMs: 1000 })
    const { sender, status } = await f.create()
    const guest = f.guests[0]
    const loads = []
    guest.loadURL = vi.fn(() => new Promise((resolve, reject) => loads.push({ resolve, reject })))
    const navigate = () =>
      f.controller.command(sender, { action: "navigate", id: status.id, url: "https://same.test/" })
    const old = navigate()
    const latest = navigate()
    loads[1].resolve()
    expect(await latest).toMatchObject({ error: null })
    guest.emit("did-fail-load", {}, -3, "ERR_ABORTED", "https://same.test/", true)
    loads[0].reject(Object.assign(new Error("superseded"), { code: "ERR_ABORTED" }))
    expect(await old).toMatchObject({ error: null })
    // An event can arrive even after both promises settle.
    guest.emit("did-fail-load", {}, -3, "ERR_ABORTED", "https://same.test/", true)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ error: null })
    const oldSuccess = navigate()
    const latestFailure = navigate()
    loads[3].reject(Object.assign(new Error("refused"), { code: "ERR_CONNECTION_REFUSED" }))
    expect(await latestFailure).toMatchObject({ error: "ERR_CONNECTION_REFUSED" })
    loads[2].resolve()
    expect(await oldSuccess).toMatchObject({ error: "ERR_CONNECTION_REFUSED" })
    guest.emit("did-navigate", {}, "https://healthy.test/")
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ error: null })
  })

  test("a successful main-frame navigation clears the latest failure while an older load is unsettled", async () => {
    const f = fixture({ loadTimeoutMs: 1000 })
    const { sender, status } = await f.create()
    const guest = f.guests[0]
    let rejectOld
    guest.loadURL = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOld = reject
          }),
      )
      .mockRejectedValueOnce(Object.assign(new Error("refused"), { code: "ERR_CONNECTION_REFUSED" }))
    const old = f.controller.command(sender, { action: "navigate", id: status.id, url: "https://old.test/" })
    expect(
      await f.controller.command(sender, { action: "navigate", id: status.id, url: "https://new.test/" }),
    ).toMatchObject({ error: "ERR_CONNECTION_REFUSED" })
    guest.emit("did-start-navigation", {}, "https://healthy.test/", false, true)
    guest.emit("did-navigate", {}, "https://healthy.test/")
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ error: null })
    rejectOld(Object.assign(new Error("superseded"), { code: "ERR_ABORTED" }))
    expect(await old).toMatchObject({ error: null })
  })

  test("loads the requested page and replies with the document it opened", async () => {
    // The agent could not put a page in front of itself before: the pane had to be
    // filled by hand. The request now arrives over the provider stream.
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    f.pushStreamRequest(navigateRequest())

    await vi.waitFor(() => {
      expect(f.requests.some((request) => request.url.endsWith("/reply"))).toBe(true)
    })

    const replyIndex = f.requests.findIndex((request) => request.url.endsWith("/reply"))
    const reply = f.requests[replyIndex].body
    expect(reply).toMatchObject({ requestID: "req-navigate", status: "Completed" })
    expect(typeof reply.generation).toBe("string")

    // The pane really loaded the URL, and the state was pushed before the reply so
    // the runtime's reply check sees the page it will list next.
    const guest = f.guests.at(-1)
    expect(guest.loadedUrls).toContain("https://example.org/flights")
    const stateIndex = f.requests.findIndex((request) => request.method === "PUT" && request.url.endsWith("/state"))
    expect(stateIndex).toBeGreaterThan(-1)
    expect(stateIndex).toBeLessThan(replyIndex)
  })

  test("refuses a URL the pane cannot open and replies with an error status", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    f.pushStreamRequest(navigateRequest({ url: "file:///etc/passwd" }))

    await vi.waitFor(() => {
      expect(f.requests.some((request) => request.url.endsWith("/reply"))).toBe(true)
    })

    const reply = f.requests.find((request) => request.url.endsWith("/reply")).body
    expect(reply).toMatchObject({ requestID: "req-navigate", status: "Error" })
    expect(f.guests.at(-1).loadedUrls).not.toContain("file:///etc/passwd")
  })

  test("mirrors the runtime's navigation rule: loopback http opens, other http does not", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })

    f.pushStreamRequest(navigateRequest({ requestID: "req-loopback", url: "http://localhost:3000/app" }))
    await vi.waitFor(() => {
      expect(f.requests.some((request) => request.url.endsWith("/reply"))).toBe(true)
    })
    const loopbackReply = f.requests.find((request) => request.url.endsWith("/reply")).body
    expect(loopbackReply).toMatchObject({ requestID: "req-loopback", status: "Completed" })

    f.pushStreamRequest(navigateRequest({ requestID: "req-lan", url: "http://192.168.1.10:3000/app" }))
    await vi.waitFor(() => {
      expect(f.requests.some((request) => request.url.endsWith("/reply") && request.body.requestID === "req-lan")).toBe(
        true,
      )
    })
    const lanReply = f.requests.find(
      (request) => request.url.endsWith("/reply") && request.body.requestID === "req-lan",
    ).body
    expect(lanReply).toMatchObject({ requestID: "req-lan", status: "Error" })
    expect(f.guests.at(-1).loadedUrls).not.toContain("http://192.168.1.10:3000/app")
  })
})

describe("desktop WebMCP capability probe", () => {
  test("reports a compatible runtime without creating a browser", async () => {
    const { controller, requests, owners } = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 99, getZoomFactor: () => 1 })
    owners.set(sender, { isDestroyed: () => false })
    const result = await controller.command(sender, { action: "capability", directory: "/tmp/project" })
    expect(result).toEqual({
      capability: "desktop.webmcp.v1",
      runtimeCapability: "desktop.webmcp.v1",
      browserMode: "embedded",
      reachable: true,
      compatible: true,
    })
    expect(requests.map((request) => request.url)).toEqual(["/desktop/browser/capability"])
  })

  test("reports an incompatible runtime as a status, not an error", async () => {
    const { controller, owners } = fixture({ capability: "desktop.webmcp.v0" })
    const sender = Object.assign(new EventEmitter(), { id: 98, getZoomFactor: () => 1 })
    owners.set(sender, { isDestroyed: () => false })
    const result = await controller.command(sender, { action: "capability", directory: "/tmp/project" })
    expect(result).toMatchObject({ compatible: false, runtimeCapability: "desktop.webmcp.v0" })
  })

  test("rejects old or Chrome-mode runtimes before enrolling an embedded provider", async () => {
    for (const browserMode of [null, "chrome"]) {
      const { controller, owners, requests, create } = fixture({ browserMode })
      const sender = Object.assign(new EventEmitter(), { id: 98, getZoomFactor: () => 1 })
      owners.set(sender, { isDestroyed: () => false })
      const result = await controller.command(sender, { action: "capability", directory: "/tmp/project" })
      expect(result.compatible).toBe(browserMode === null ? null : false)
      const browser = await create()
      await expect(
        controller.command(browser.sender, { action: "enable", id: browser.status.id }),
      ).resolves.toMatchObject({
        reason: browserMode === null ? "enable-failed" : "runtime-incompatible",
        enabled: false,
      })
      expect(requests.some((request) => request.method === "POST")).toBe(false)
    }
  })

  test("reports an unreachable runtime as unknown rather than incompatible", async () => {
    const { controller, owners } = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 95, getZoomFactor: () => 1 })
    owners.set(sender, { isDestroyed: () => false })
    const offline = createDesktopWebMcpBrowser({
      BrowserWindow: { fromWebContents: (value) => owners.get(value) },
      WebContentsView: class {},
      session: { fromPartition: () => ({}) },
      getRuntime: () => null,
      getAuthorization: () => "Basic fixture",
      providerToken: "fixture-only-token",
    })
    controllers.push(offline)
    await expect(offline.command(sender, { action: "capability", directory: "/tmp/project" })).resolves.toMatchObject({
      reachable: false,
      compatible: null,
      runtimeCapability: null,
    })
    expect(controller).toBeTruthy()
  })

  test("refuses the probe for a sender without a desktop window", async () => {
    const { controller } = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 96, getZoomFactor: () => 1 })
    await expect(controller.command(sender, { action: "capability", directory: "/tmp/project" })).rejects.toThrow(
      "local desktop window",
    )
  })

  test("rejects relative directories for the probe", async () => {
    const { controller, owners } = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 97, getZoomFactor: () => 1 })
    owners.set(sender, { isDestroyed: () => false })
    await expect(controller.command(sender, { action: "capability", directory: "project" })).rejects.toThrow(
      "Select a project",
    )
  })
})

describe("native project browser integration", () => {
  test("rejects another window using an enrolled browser ID", async () => {
    const f = fixture()
    const first = await f.create()
    const second = await f.create()
    await expect(f.controller.command(second.sender, { action: "status", id: first.status.id })).rejects.toThrow(
      "another window",
    )
  })

  test("waits for the pane to attach when enable arrives before the first bounds", async () => {
    const f = fixture()
    const { sender, status } = await f.create({ attach: false })
    const enabling = f.controller.command(sender, { action: "enable", id: status.id })
    await new Promise((resolve) => setTimeout(resolve, 60))
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 800, height: 600 })
    expect((await enabling).enabled).toBe(true)
  })

  test("a disconnect while waiting for the pane cancels the pending enable", async () => {
    const f = fixture()
    const { sender, status } = await f.create({ attach: false })
    const enabling = f.controller.command(sender, { action: "enable", id: status.id })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await f.controller.command(sender, { action: "disconnect", id: status.id })
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 800, height: 600 })
    await expect(enabling).resolves.toMatchObject({ reason: "enable-failed", enabled: false })
    expect((await f.controller.command(sender, { action: "status", id: status.id })).enabled).toBe(false)
    expect(f.requests.some((request) => request.method === "POST")).toBe(false)
  })

  test("still refuses to enable a pane that never becomes visible", async () => {
    const f = fixture({ attachTimeoutMs: 80 })
    const { sender, status } = await f.create({ attach: false })
    await expect(f.controller.command(sender, { action: "enable", id: status.id })).resolves.toMatchObject({
      reason: "enable-failed",
      enabled: false,
    })
    expect(f.requests.some((request) => request.method === "POST")).toBe(false)
  })

  test("keeps agent access disabled when the signed runtime lacks the capability", async () => {
    const f = fixture({ capability: "unsupported" })
    const { sender, status } = await f.create()
    await expect(f.controller.command(sender, { action: "enable", id: status.id })).resolves.toMatchObject({
      reason: "runtime-incompatible",
      error: "runtime-incompatible",
      enabled: false,
    })
    expect((await f.controller.command(sender, { action: "status", id: status.id })).enabled).toBe(false)
    expect(f.requests.some((request) => request.method === "POST")).toBe(false)
  })

  test("closes every guest before waiting for slow runtime revocation acknowledgments", async () => {
    const f = fixture({ holdRevocation: true })
    for (let index = 0; index < 2; index++) {
      const { sender, status } = await f.create()
      await f.controller.command(sender, { action: "enable", id: status.id })
    }
    const closing = f.controller.closeAll()
    await Promise.resolve()
    expect(f.guests.every((contents) => contents.destroyed)).toBe(true)
    await vi.waitFor(() => expect(f.revocations).toHaveLength(2))
    f.revocations.forEach((resolve) => resolve({}))
    await closing
  })

  test("serializes concurrent creates for one window so the loser cannot orphan its view", async () => {
    // Two creates racing before either reached the view registry both passed the
    // "replace the existing pane" check; the loser's WebContentsView stayed
    // attached but untracked until the window closed.
    const f = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 1, getZoomFactor: () => 1 })
    const owner = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      getContentBounds: () => ({ width: 800, height: 600 }),
      contentView: { addChildView() {}, removeChildView() {} },
    })
    f.owners.set(sender, owner)
    const createArgs = (url) => ({
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_fixture",
      url,
    })

    const [first, second] = await Promise.all([
      f.controller.command(sender, createArgs("https://example.com/")),
      f.controller.command(sender, createArgs("https://example.org/")),
    ])

    expect(first.id).toBe(second.id)
    // Concurrent creates of the same identity reuse its live page.
    expect(f.guests).toHaveLength(1)
    expect(f.guests.filter((contents) => !contents.destroyed)).toHaveLength(1)
    await expect(f.controller.command(sender, { action: "status", id: second.id })).resolves.toMatchObject({
      id: second.id,
    })
  })

  test("revokes agent access when the page adapter dies", async () => {
    // A debugger detach, a renderer crash or an unusable catalog leaves the
    // adapter unable to run any call. Keeping the provider enrolled made every
    // later agent call time out as unconfirmed instead of failing with the
    // "enable the project browser" reason.
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    expect((await f.controller.command(sender, { action: "status", id: status.id })).enabled).toBe(true)

    f.guests.at(-1).debugger.emit("detach")

    await vi.waitFor(() => {
      expect(f.requests.some((request) => request.method === "DELETE")).toBe(true)
    })
    const after = await f.controller.command(sender, { action: "status", id: status.id })
    expect(after.nativeAvailable).toBe(false)
    expect(after.enabled).toBe(false)
  })

  test("reconciles the tool catalog with the runtime when enrollment completes", async () => {
    // A change that lands while enrollment is in flight is dropped (synchronize
    // only pushes with a live connection), so enrollment reconciles once: the
    // runtime must not keep the catalog the POST carried while the adapter has
    // already moved on.
    const f = fixture()
    const { sender, status } = await f.create()

    await f.controller.command(sender, { action: "enable", id: status.id })

    const enrollmentPost = f.requests.findIndex(
      (request) => request.method === "POST" && request.url.endsWith("/provider"),
    )
    expect(enrollmentPost).toBeGreaterThanOrEqual(0)
    const statePuts = f.requests.filter((request) => request.method === "PUT" && request.url.endsWith("/state"))
    expect(statePuts).toHaveLength(1)
    expect(f.requests.indexOf(statePuts[0])).toBeGreaterThan(enrollmentPost)
  })

  test("fails a first load that never settles instead of leaving the pane without an id", async () => {
    // A server that accepts TCP and never answers used to hang the pane in
    // "starting": the renderer never received an id, so every control it offers
    // (address bar, Go, Reload) stayed disabled and the agent saw the browser as
    // unavailable. The deadline turns the hang into a settled, failed load, which
    // the create path already handles by keeping the pane usable.
    const f = fixture()
    f.hangLoads(true)
    const sender = Object.assign(new EventEmitter(), { id: 77, getZoomFactor: () => 1 })
    f.owners.set(
      sender,
      Object.assign(new EventEmitter(), {
        isDestroyed: () => false,
        isVisible: () => true,
        isMinimized: () => false,
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        getContentBounds: () => ({ width: 800, height: 600 }),
        contentView: { addChildView() {}, removeChildView() {} },
      }),
    )

    const created = await Promise.race([
      f.controller.command(sender, {
        action: "create",
        directory: "/tmp/project",
        sessionID: "ses_fixture",
        url: "https://example.com/",
      }),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("create never settled while the page load hung")), 1000),
      ),
    ])

    expect(created.id).toBeTruthy()
  })

  test("refuses a command aimed at a pane whose view is already gone", async () => {
    // Teardown destroys the webContents, which can land between the lookup and the command: the
    // raw Electron error ("Object has been destroyed") reached the renderer, while every other
    // branch in this file guards the same object.
    const f = fixture()
    const { sender, status } = await f.create()
    f.guests.at(-1).destroyed = true

    await expect(f.controller.command(sender, { action: "reload", id: status.id })).rejects.toThrow(
      "no longer available",
    )
    await expect(
      f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org/next" }),
    ).rejects.toThrow("no longer available")
  })

  test("fails a navigation that never settles instead of leaving the pane busy", async () => {
    const f = fixture()
    const { sender, status } = await f.create()

    f.hangLoads(true)

    await expect(
      f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org/next" }),
    ).resolves.toMatchObject({ error: "operation-failed" })
  })
})

describe("desktop WebMCP page interaction requests", () => {
  const boundRequest = (status, overrides) => ({
    providerID: "provider-1",
    epoch: "boot",
    projectID: "project",
    sessionID: "ses_fixture",
    generation: status.generation,
    origin: "https://example.com",
    frameId: "top",
    deadline: Date.now() + 30000,
    ...overrides,
  })

  test("reads the page and replies with its text and outline", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    const guest = f.guests.at(-1)
    guest.executeJavaScriptInIsolatedWorld = async () => ({
      title: "Flights",
      text: "Toronto to Tokyo",
      outline: [{ ref: "e1", kind: "button", name: "Search" }],
    })
    f.pushStreamRequest(boundRequest(live, { requestID: "req-read", operation: "read" }))

    await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
    expect(replies(f)[0].body).toMatchObject({
      requestID: "req-read",
      status: "Completed",
      output: { title: "Flights", text: "Toronto to Tokyo" },
    })
  })

  test("holds an action on the same page without discarding its read reference", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    const guest = f.guests[0]
    guest.executeJavaScriptInIsolatedWorld = vi.fn(async () => ({ title: "Page", text: "", outline: [{ ref: "e1" }] }))
    f.pushStreamRequest(boundRequest(live, { requestID: "read-before-pause", operation: "read" }))
    await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
    await f.controller.command(sender, { action: "pause", id: status.id })
    f.pushStreamRequest(
      boundRequest(live, {
        requestID: "held-act",
        operation: "act",
        readId: replies(f)[0].body.output.readId,
        ref: "e1",
        how: "click",
      }),
    )
    await vi.waitFor(async () =>
      expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ waiting: true }),
    )
    expect(guest.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1)
    await f.controller.command(sender, { action: "resume", id: status.id })
    await vi.waitFor(() => expect(replies(f)).toHaveLength(2))
    expect(guest.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2)
    expect(replies(f)[1].body).toMatchObject({ requestID: "held-act", status: "Completed" })
  })

  test("pushes the new document before replying to an action that navigated", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    const guest = f.guests.at(-1)
    let navigate = false
    guest.executeJavaScriptInIsolatedWorld = async () => {
      if (navigate) guest.debugger.emit("message", {}, "Page.frameNavigated", { frame: { id: "top" } })
      return navigate ? { ok: true } : { title: "", text: "", outline: [{ ref: "e1" }] }
    }
    f.pushStreamRequest(boundRequest(live, { requestID: "req-read", operation: "read" }))
    await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
    navigate = true
    f.pushStreamRequest(
      boundRequest(live, {
        requestID: "req-act",
        operation: "act",
        readId: replies(f)[0].body.output.readId,
        ref: "e1",
        how: "click",
      }),
    )

    await vi.waitFor(() => expect(replies(f)).toHaveLength(2))
    const reply = replies(f)[1]
    expect(reply.body).toMatchObject({ requestID: "req-act", status: "Completed", output: { navigated: true } })
    expect(reply.body.generation).not.toBe(live.generation)
    const lastState = f.requests.findLastIndex((request) => request.method === "PUT" && request.url.endsWith("/state"))
    expect(lastState).toBeGreaterThan(-1)
    expect(lastState).toBeLessThan(f.requests.indexOf(reply))
  })

  test("answers an action on stale references with an error status", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    f.guests.at(-1).executeJavaScriptInIsolatedWorld = async () => ({ ok: true })
    f.pushStreamRequest(
      boundRequest(live, {
        requestID: "req-act",
        operation: "act",
        readId: "00000000-0000-4000-8000-000000000000",
        ref: "e1",
        how: "click",
      }),
    )
    await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
    expect(replies(f)[0].body).toMatchObject({ requestID: "req-act", status: "Error" })
  })
})

describe("Round 8 browser lifecycle", () => {
  test("pausing before access is ever enabled does not break a later enable or resume", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "pause", id: status.id })
    const enabled = await f.controller.command(sender, { action: "enable", id: status.id })
    expect(enabled).toMatchObject({ enabled: true })
    await f.controller.command(sender, { action: "pause", id: status.id })
    expect(await f.controller.command(sender, { action: "resume", id: status.id })).toMatchObject({
      enabled: true,
      paused: false,
    })
  })

  test("pauses without losing the page, storage or enrollment and resumes the same provider", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const enabled = await f.controller.command(sender, { action: "enable", id: status.id })
    const paused = await f.controller.command(sender, {
      action: "pause",
      id: status.id,
    })
    expect(paused).toMatchObject({ paused: true, enabled: false, url: enabled.url })
    expect(paused.generation).toBe(enabled.generation)
    expect(paused.stoppedCalls).toBe(0)
    expect(f.guests[0].destroyed).toBe(false)
    const visible = await f.controller.command(sender, {
      action: "bounds",
      id: status.id,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(visible).toMatchObject({ paused: true, enabled: false })
    expect(f.requests.filter((r) => r.url.endsWith("/provider") && r.method === "POST")).toHaveLength(1)
    const resumed = await f.controller.command(sender, { action: "resume", id: status.id })
    expect(resumed).toMatchObject({ paused: false, enabled: true, url: enabled.url })
    expect(resumed.generation).toBe(paused.generation)
    expect(f.requests.filter((r) => r.method === "DELETE")).toHaveLength(0)
    expect(f.requests.filter((r) => r.url.endsWith("/provider") && r.method === "POST")).toHaveLength(1)
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
    for (const profile of f.partitions.values()) expect(profile.clearStorageData).not.toHaveBeenCalled()
    expect(f.requests.filter((r) => r.url.endsWith("/capability"))).toHaveLength(2)
    expect(f.requests.filter((r) => r.url.endsWith("/reply"))).toHaveLength(0)
  })

  test.each(["before-pause", "after-pause"])(
    "holds a %s call, exposes waiting and releases it exactly once on resume",
    async (arrival) => {
      const f = fixture()
      const { sender, status } = await f.create()
      const enabled = await f.controller.command(sender, { action: "enable", id: status.id })
      const request = { ...navigateRequest(), generation: enabled.generation }
      if (arrival === "before-pause") f.pushStreamRequest(request)
      await f.controller.command(sender, { action: "pause", id: status.id })
      if (arrival === "after-pause") f.pushStreamRequest(request)
      await vi.waitFor(async () =>
        expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
          waiting: true,
          paused: true,
          visible: true,
        }),
      )
      expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
      expect(replies(f)).toHaveLength(0)
      // Visibility events must not release a deliberately paused call.
      await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 100, height: 100 })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(f.guests[0].loadedUrls).toHaveLength(1)
      await f.controller.command(sender, { action: "resume", id: status.id })
      await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
      expect(replies(f)[0].body).toMatchObject({ requestID: request.requestID, status: "Completed" })
      expect(f.guests[0].loadedUrls).toEqual(["https://example.com/", request.url])
      expect(f.requests.filter((r) => r.url.endsWith("/provider") && r.method === "POST")).toHaveLength(1)
    },
  )

  test.each([false, true])("held native calls retain their document binding (page changed: %s)", async (changed) => {
    const f = fixture()
    const { sender, status } = await f.create()
    const guest = f.guests[0]
    const tool = { name: "held", frameId: "top", description: "Held tool", inputSchema: { type: "object" } }
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [tool] })
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    guest.debugger.sendCommand = vi.fn(async (method) =>
      method === "WebMCP.invokeTool" ? { invocationId: "held-native" } : {},
    )
    await f.controller.command(sender, { action: "pause", id: status.id })
    f.pushStreamRequest({
      ...navigateRequest(),
      operation: "invoke",
      requestID: "held-tool",
      generation: live.generation,
      origin: "https://example.com",
      frameId: "top",
      toolName: "held",
      digest: definitionDigest(tool),
      input: {},
    })
    await vi.waitFor(async () =>
      expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ waiting: true }),
    )
    expect(guest.debugger.sendCommand).not.toHaveBeenCalledWith("WebMCP.invokeTool", expect.anything())
    if (changed) guest.debugger.emit("message", {}, "Page.frameNavigated", { frame: { id: "new-page" } })
    await f.controller.command(sender, { action: "resume", id: status.id })
    if (!changed) {
      await vi.waitFor(() =>
        expect(guest.debugger.sendCommand).toHaveBeenCalledWith("WebMCP.invokeTool", expect.anything()),
      )
      guest.debugger.emit("message", {}, "WebMCP.toolResponded", {
        invocationId: "held-native",
        status: "Completed",
        output: "kept",
      })
    }
    await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
    expect(replies(f)[0].body.status).toBe(changed ? "Error" : "Completed")
    expect(guest.debugger.sendCommand.mock.calls.filter(([method]) => method === "WebMCP.invokeTool")).toHaveLength(
      changed ? 0 : 1,
    )
  })

  test("disconnect fails a held call with a reason and never releases it on a later enrollment", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    await f.controller.command(sender, { action: "pause", id: status.id })
    f.pushStreamRequest(navigateRequest())
    await vi.waitFor(async () =>
      expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ waiting: true }),
    )
    expect(await f.controller.command(sender, { action: "disconnect", id: status.id })).toMatchObject({
      paused: false,
      enabled: false,
      // The held call never ran, but it was failed: the person is told one call was stopped.
      stoppedCalls: 1,
    })
    expect(replies(f).map((r) => r.body)).toEqual([
      expect.objectContaining({ status: "Error", output: expect.objectContaining({ reason: "agent-disconnected" }) }),
    ])
    await f.controller.command(sender, { action: "enable", id: status.id })
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
  })

  test("a held call keeps its deadline and times out without executing", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    await f.controller.command(sender, { action: "pause", id: status.id })
    f.pushStreamRequest({ ...navigateRequest(), deadline: Date.now() + 100 })
    await vi.waitFor(() => expect(replies(f)).toHaveLength(1))
    expect(replies(f)[0].body).toMatchObject({ status: "Error", output: { reason: "waiting-for-resume-timeout" } })
    await f.controller.command(sender, { action: "resume", id: status.id })
    expect(f.guests[0].loadedUrls).toHaveLength(1)
  })

  test("revalidates runtime compatibility on resume and leaves access paused on failure", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    await f.controller.command(sender, { action: "pause", id: status.id })
    f.setCapability("unsupported")
    await expect(f.controller.command(sender, { action: "resume", id: status.id })).resolves.toMatchObject({
      reason: "runtime-incompatible",
      error: "runtime-incompatible",
      enabled: false,
    })
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      paused: true,
      enabled: false,
    })
  })

  test("allows draft navigation but refuses draft enrollment", async () => {
    const f = fixture()
    const { sender, status } = await f.create({ sessionID: null })
    expect(
      await f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org/" }),
    ).toMatchObject({ enabled: false })
    await expect(f.controller.command(sender, { action: "enable", id: status.id })).resolves.toMatchObject({
      reason: "session-required",
      enabled: false,
    })
    expect(f.requests.some((r) => r.method === "POST")).toBe(false)
  })

  test("returns only fixed native reason codes, never raw error URLs or credentials", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    f.guests[0].loadURL = async () => {
      throw new Error("ERR_UNSAFE_PORT (-312) https://user:secret@example.org:1/?token=secret")
    }
    expect(
      await f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org:1/" }),
    ).toMatchObject({ error: "ERR_UNSAFE_PORT" })
    f.guests[0].loadURL = async () => {
      throw new Error("ERR_SECRET_CREDENTIAL https://user:secret@example.org/")
    }
    expect(
      await f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org/" }),
    ).toMatchObject({ error: "operation-failed" })
    f.guests[0].emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", "https://secret/", false)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      error: "operation-failed",
    })
    f.guests[0].emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", "https://secret/", true)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      error: "ERR_CONNECTION_REFUSED",
    })
  })

  test("keeps unreported compatibility unknown", async () => {
    const f = fixture({ capability: null })
    const { sender } = await f.create()
    expect(await f.controller.command(sender, { action: "capability", directory: "/tmp/project" })).toMatchObject({
      compatible: null,
    })
  })
})

test("preserves the initial native load cause while keeping the address bar usable", async () => {
  const f = fixture({ loadError: Object.assign(new Error("secret URL"), { code: "ERR_UNSAFE_PORT" }) })
  const { status } = await f.create()
  expect(status.id).toBeTruthy()
  expect(status).toMatchObject({ error: "ERR_UNSAFE_PORT", enabled: false })
})

describe("page tools for the user", () => {
  test("lists the page's tools for the user and lets them try one without granting the agent anything", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const guest = f.guests.at(-1)
    const tool = {
      name: "add_numbers",
      description: "Add two integers",
      frameId: "top",
      inputSchema: { type: "object", properties: { a: { type: "integer" }, b: { type: "integer" } } },
    }
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [tool] })
    const listed = await f.controller.command(sender, { action: "status", id: status.id })
    expect(listed.enabled).toBe(false)
    expect(listed.catalog).toEqual([
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        kind: "script",
        digest: catalogDigest(tool),
      },
    ])
    expect(listed.catalogTotal).toBe(1)
    expect(listed.catalogTruncation).toBeNull()
    expect(listed.catalogRejection).toBeNull()

    guest.debugger.sendCommand = async (method, params) => {
      if (method === "WebMCP.invokeTool") {
        expect(params).toMatchObject({ toolName: "add_numbers", input: { a: 2, b: 3 } })
        queueMicrotask(() =>
          guest.debugger.emit("message", {}, "WebMCP.toolResponded", {
            invocationId: "inv-1",
            status: "Completed",
            output: { content: [{ type: "text", text: "5" }] },
          }),
        )
        return { invocationId: "inv-1" }
      }
      return method === "Page.getFrameTree" ? { frameTree: { frame: { id: "top" } } } : {}
    }
    const tried = await f.controller.command(sender, {
      action: "tryTool",
      id: status.id,
      toolName: "add_numbers",
      input: { a: 2, b: 3 },
    })
    expect(tried).toEqual({ ok: true, outcome: "completed", output: { content: [{ type: "text", text: "5" }] } })
    // Trying a tool is the user acting: no provider enrollment, no grant.
    expect(f.requests.some((request) => request.method === "POST" && request.url.endsWith("/provider"))).toBe(false)
    expect(
      await f.controller.command(sender, { action: "tryTool", id: status.id, toolName: "missing", input: {} }),
    ).toEqual({ ok: false, outcome: "failed", reason: "tool-not-found" })
  })

  test("projects form tools, hint badges, a 64-of-N catalog, and a named rejection without disconnecting", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const guest = f.guests.at(-1)
    const form = {
      name: "save_form",
      description: "Save the form",
      frameId: "top",
      backendNodeId: 7,
      annotations: { readOnly: true, consequentialHint: true },
    }
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [form] })
    const listed = await f.controller.command(sender, { action: "status", id: status.id })
    expect(listed.nativeAvailable).toBe(true)
    expect(listed.catalog[0]).toEqual({
      name: form.name,
      description: form.description,
      annotations: { readOnlyHint: true, untrustedContentHint: false, consequentialHint: true },
      kind: "form",
      digest: catalogDigest({
        name: form.name,
        description: form.description,
        frameId: "top",
        annotations: form.annotations,
      }),
    })

    const many = Array.from({ length: 65 }, (_, index) => ({
      name: `tool_${index}`,
      description: "Short",
      frameId: "top",
    }))
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: many })
    const capped = await f.controller.command(sender, { action: "status", id: status.id })
    expect(capped.nativeAvailable).toBe(true)
    expect(capped.tools).toBe(66)
    expect(capped.catalog).toHaveLength(64)
    expect(capped.catalogTotal).toBe(66)
    expect(capped.catalogTruncation).toBe("count")
    expect(capped.catalogRejection).toBeNull()

    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", {
      tools: [
        { name: "echo", description: "One", frameId: "top" },
        { name: "echo", description: "Two", frameId: "top" },
      ],
    })
    const rejected = await f.controller.command(sender, { action: "status", id: status.id })
    expect(rejected.nativeAvailable).toBe(true)
    expect(rejected.error).toBeNull()
    expect(rejected.enabled).toBe(false)
    expect(rejected.catalog).toHaveLength(64)
    expect(rejected.catalogRejection).toEqual({ code: "invalid-catalog", reason: "duplicate-name", tool: "echo" })
  })
})

test("the visible catalog stops at 64 tools and at 256 KiB before a later definition", () => {
  const tools = Array.from({ length: 65 }, (_, index) => ({
    name: `tool_${index}`,
    description: "Short",
    inputSchema: { type: "object" },
  }))
  const counted = projectToolCatalog(tools)
  expect(counted.catalog).toHaveLength(64)
  expect(counted.total).toBe(65)
  expect(counted.truncation).toBe("count")
  expect(counted.catalog[0].kind).toBe("script")
  expect(counted.catalog[0].digest).toMatch(/^[a-f0-9]{64}$/)

  const small = { name: "small", description: "d", inputSchema: { type: "object" } }
  const large = { name: "large", description: "d", inputSchema: { pad: "x".repeat(262144) } }
  const sized = projectToolCatalog([small, large])
  expect(sized.catalog.map((entry) => entry.name)).toEqual(["small"])
  expect(sized.total).toBe(2)
  expect(sized.truncation).toBe("bytes")

  const hints = projectToolCatalog(
    [{ name: "save", description: "Save", annotations: { readOnly: true, consequential: 1 } }],
    new Map([["save", "form"]]),
  )
  expect(hints.catalog[0]).toMatchObject({
    kind: "form",
    annotations: { readOnlyHint: true, untrustedContentHint: false, consequentialHint: false },
  })
})

describe("manual invocation native outcomes", () => {
  test.each([
    ["Completed", { value: 5 }, "completed", undefined],
    ["Completed", { isError: true }, "application-error", "application-error"],
    ["Completed", { status: "timeout", isError: true }, "timeout", "timeout"],
    ["Completed", JSON.stringify({ untrusted: true, result: { status: "cancelled" } }), "cancelled", "cancelled"],
    ["Completed", "x".repeat(65537), "failed", "result-too-large"],
    ["replace", "stale", "failed", "definition-changed"],
    ["Error", { error: "password=hunter2" }, "application-error", "application-error"],
    ["Canceled", {}, "cancelled", "cancelled"],
    ["Timeout", {}, "timeout", "timeout"],
    ["detach", {}, "uncertain", "provider-gone"],
    ["command-rejected", {}, "uncertain", "provider-gone"],
  ])("%s maps to %s through the manual IPC path", async (nativeStatus, output, outcome, reason) => {
    const f = fixture()
    const { sender, status } = await f.create()
    const guest = f.guests.at(-1)
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", {
      tools: [{ name: "echo", description: "Echo", frameId: "top" }],
    })
    guest.debugger.sendCommand = async (method, params) => {
      if (method !== "WebMCP.invokeTool") return {}
      expect(params.input).toEqual({ text: "  exact  ", zero: 0, off: false, empty: "" })
      if (nativeStatus === "command-rejected") throw new Error("password=hunter2")
      queueMicrotask(() => {
        if (nativeStatus === "detach") guest.debugger.emit("detach")
        else {
          if (nativeStatus === "replace") {
            guest.debugger.emit("message", {}, "WebMCP.toolsRemoved", { tools: [{ name: "echo", frameId: "top" }] })
            guest.debugger.emit("message", {}, "WebMCP.toolsAdded", {
              tools: [{ name: "echo", description: "Updated", frameId: "top" }],
            })
          }
          guest.debugger.emit("message", {}, "WebMCP.toolResponded", {
            invocationId: "manual",
            status: nativeStatus === "replace" ? "Completed" : nativeStatus,
            output,
          })
        }
      })
      return { invocationId: "manual" }
    }
    const result = await f.controller.command(sender, {
      action: "tryTool",
      id: status.id,
      toolName: "echo",
      input: { text: "  exact  ", zero: 0, off: false, empty: "" },
    })
    expect(result).toMatchObject({ ok: outcome === "completed", outcome, ...(reason ? { reason } : {}) })
    if (nativeStatus === "Error" || nativeStatus === "command-rejected")
      expect(JSON.stringify(result)).not.toContain("hunter2")
    expect(f.requests.some((request) => request.method === "POST")).toBe(false)
  })
})

describe("WX-15 view pool", () => {
  test("two sessions coexist in one window without replacing the first page", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const second = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_second",
      url: "https://second.test/",
    })
    expect(second.id).not.toBe(status.id)
    expect(f.guests.filter((guest) => !guest.destroyed)).toHaveLength(2)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      url: "https://example.com/",
    })
  })
})

describe("WX-15 project profiles", () => {
  test("shares one hardened profile per project, isolates projects and preserves storage on close", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const create = (directory, sessionID) =>
      f.controller.command(sender, { action: "create", directory, sessionID, url: "about:blank" })
    const second = await create("/tmp/project/", "ses_second")
    await create("/tmp/other", "ses_other")
    expect(f.guests[0].partition).toBe(f.guests[1].partition)
    expect(f.guests[0].partition).not.toBe(f.guests[2].partition)
    expect(f.partitions.size).toBe(2)
    for (const profile of f.partitions.values()) {
      expect(profile.setPermissionRequestHandler).toHaveBeenCalledTimes(1)
      expect(profile.setPermissionCheckHandler).toHaveBeenCalledTimes(1)
      expect(profile.listenerCount("will-download")).toBe(1)
    }
    await f.controller.command(sender, { action: "close", id: second.id })
    for (const profile of f.partitions.values()) expect(profile.clearStorageData).not.toHaveBeenCalled()
    await f.controller.command(sender, { action: "clearProject", directory: "/tmp/project" })
    expect(f.guests[0].destroyed).toBe(true)
    expect(f.guests[2].destroyed).toBe(false)
    expect(f.partitions.get(f.guests[0].partition).clearStorageData).toHaveBeenCalledTimes(1)
    await expect(f.controller.command(sender, { action: "status", id: status.id })).rejects.toThrow()
  })

  test("serializes explicit clears and a new page behind the completed storage wipe", async () => {
    const f = fixture()
    const { sender } = await f.create()
    let finish
    const profile = [...f.partitions.values()][0]
    profile.clearStorageData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const clearing = f.controller.command(sender, { action: "clearProject", directory: "/tmp/project" })
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
    expect(f.guests[0].destroyed).toBe(true)
    const creating = f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_new",
      url: "about:blank",
    })
    await Promise.resolve()
    expect(f.guests).toHaveLength(1)
    finish()
    await clearing
    await creating
    expect(f.guests).toHaveLength(2)
    expect(f.partitions.size).toBe(1)
    expect(f.controller.poolStats()).toMatchObject({ pendingCreates: 0, pendingGuestClears: 0 })
  })
})

describe("WX-15 additive IPC", () => {
  test("lists only the owning window and switches one shown view while old create/bounds still works", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const second = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_second",
      url: "https://second.test/",
    })
    const bounds = { x: 0, y: 0, width: 400, height: 300 }
    await f.controller.command(sender, { action: "bounds", id: second.id, ...bounds })
    expect(await f.controller.command(sender, { action: "list" })).toMatchObject({
      views: [
        { id: status.id, directory: "/tmp/project", sessionID: "ses_fixture", visible: true, waiting: false },
        { id: second.id, directory: "/tmp/project", sessionID: "ses_second", visible: false },
      ],
    })
    expect(await f.controller.command(sender, { action: "show", id: second.id })).toMatchObject({ visible: true })
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ visible: false })
    const other = await f.create()
    expect((await f.controller.command(other.sender, { action: "list" })).views).toHaveLength(1)
    await expect(f.controller.command(other.sender, { action: "show", id: second.id })).rejects.toThrow(
      "another window",
    )
    await expect(
      f.controller.command(sender, { action: "show", id: second.id, sessionID: "ses_wrong" }),
    ).rejects.toThrow("session mismatch")
  })
})

describe("WX-15 visible-to-act gate", () => {
  const request = (partial = {}) => ({
    providerID: "provider-1",
    epoch: "boot",
    projectID: "project",
    sessionID: "ses_fixture",
    requestID: "hidden-call",
    operation: "navigate",
    generation: "page",
    deadline: Date.now() + 2000,
    url: "https://agent.test/",
    ...partial,
  })
  const bounds = { x: 0, y: 0, width: 500, height: 300 }
  test.each(["dialog", "palette", "minimize"])(
    "%s preserves executing navigation and holds only new calls",
    async (reason) => {
      const f = fixture({ loadTimeoutMs: 2000 })
      const { sender, status } = await f.create()
      await f.controller.command(sender, { action: "enable", id: status.id })
      const guest = f.guests[0]
      const load = guest.loadURL
      let finish
      guest.loadURL = vi.fn(
        (url) =>
          new Promise((resolve) => {
            finish = async () => {
              await load(url)
              resolve()
            }
          }),
      )
      f.pushStreamRequest(request({ requestID: "executing" }))
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
      const owner = f.owners.get(sender)
      if (reason === "minimize") {
        owner.isMinimized = () => true
        owner.emit("minimize")
      } else {
        await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
      }
      expect(guest.stop).not.toHaveBeenCalled()
      f.pushStreamRequest(request({ requestID: "next" }))
      await vi.waitFor(async () =>
        expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
          waiting: true,
        }),
      )
      await finish()
      await vi.waitFor(() =>
        expect(
          f.requests.some(
            (r) => r.url.endsWith("/reply") && r.body.requestID === "executing" && r.body.status === "Completed",
          ),
        ).toBe(true),
      )
      expect(guest.loadURL).toHaveBeenCalledTimes(1)
      guest.loadURL = load
      if (reason === "minimize") {
        owner.isMinimized = () => false
        owner.emit("restore")
      } else await f.controller.command(sender, { action: "bounds", id: status.id, ...bounds })
      await vi.waitFor(() =>
        expect(
          f.requests.some(
            (r) => r.url.endsWith("/reply") && r.body.requestID === "next" && r.body.status === "Completed",
          ),
        ).toBe(true),
      )
    },
  )

  test("a hidden request stops polling and runs only on its own shown page", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    const second = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/other",
      sessionID: "ses_other",
      url: "https://other.test/",
    })
    await f.controller.command(sender, { action: "bounds", id: second.id, ...bounds })
    await f.controller.command(sender, { action: "show", id: second.id })
    const polls = f.requests.filter((r) => r.url.endsWith("/next")).length
    f.pushStreamRequest(request())
    await vi.waitFor(async () =>
      expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
        waiting: true,
        enabled: true,
        visible: false,
      }),
    )
    expect(f.requests.filter((r) => r.url.endsWith("/next"))).toHaveLength(polls)
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
    expect(f.guests[1].loadedUrls).toEqual(["https://other.test/"])
    await f.controller.command(sender, { action: "show", id: status.id })
    await vi.waitFor(() => expect(f.guests[0].loadedUrls).toContain("https://agent.test/"))
    expect(f.guests[1].loadedUrls).toEqual(["https://other.test/"])
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      waiting: false,
      visible: true,
    })
  })
  test("expires a hidden call with a distinct reason and never executes it on late show", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
    f.pushStreamRequest(request({ deadline: Date.now() + 80 }))
    await vi.waitFor(() =>
      expect(f.requests.find((r) => r.url.endsWith("/reply"))?.body).toMatchObject({
        status: "Error",
        output: { reason: "waiting-for-visible-timeout" },
      }),
    )
    await f.controller.command(sender, { action: "bounds", id: status.id, ...bounds })
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
  })
  test.each(["providerID", "epoch", "sessionID", "projectID"])(
    "rejects %s identity mismatch before dispatch",
    async (field) => {
      const f = fixture()
      const { sender, status } = await f.create()
      await f.controller.command(sender, { action: "enable", id: status.id })
      f.pushStreamRequest(request({ [field]: "wrong" }), "provider-1")
      await vi.waitFor(async () =>
        expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
          enabled: false,
          error: "disconnected",
        }),
      )
      expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
    },
  )
})

describe("WX-15 session enrollment and revocation", () => {
  test("validates session/project ownership before posting enrollment", async () => {
    const f = fixture({ sessionDirectory: "/tmp/somewhere-else" })
    const { sender, status } = await f.create()
    expect(await f.controller.command(sender, { action: "enable", id: status.id })).toMatchObject({
      enabled: false,
      reason: "enable-failed",
    })
    expect(f.requests.some((r) => r.url.endsWith("/provider") && r.method === "POST")).toBe(false)
  })
  test("revokes only the selected session, retaining the other provider, pages and shared storage", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    const second = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_second",
      url: "https://second.test/",
    })
    await f.controller.command(sender, { action: "show", id: second.id })
    await f.controller.command(sender, { action: "bounds", id: second.id, x: 0, y: 0, width: 500, height: 300 })
    const before = await f.controller.command(sender, { action: "enable", id: second.id })
    await f.controller.command(sender, { action: "revokeSession", directory: "/tmp/project", sessionID: "ses_fixture" })
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      enabled: false,
      url: "https://example.com/",
    })
    expect(await f.controller.command(sender, { action: "status", id: second.id })).toMatchObject({
      enabled: true,
      url: "https://second.test/",
      generation: before.generation,
    })
    expect(f.requests.filter((r) => r.method === "DELETE").map((r) => r.url)).toEqual([
      "/desktop/browser/provider/provider-1",
    ])
    expect(f.guests.every((guest) => !guest.destroyed)).toBe(true)
    expect([...f.partitions.values()][0].clearStorageData).not.toHaveBeenCalled()
    f.pushStreamRequest({
      providerID: "provider-2",
      epoch: "boot",
      projectID: "project",
      sessionID: "ses_second",
      requestID: "survivor",
      generation: before.generation,
      operation: "navigate",
      url: "https://survivor.test/",
      deadline: Date.now() + 2000,
    })
    await vi.waitFor(() => expect(f.guests[1].loadedUrls).toContain("https://survivor.test/"))
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
  })
})

describe("WX-15 bounded lifecycle", () => {
  test("200 switches and session churn keep listeners, guest profiles and waiting timers bounded", async () => {
    vi.useFakeTimers()
    try {
      const f = fixture()
      const { sender, status } = await f.create()
      await f.controller.command(sender, { action: "enable", id: status.id })
      const owner = f.owners.get(sender)
      const baseline = (emitter) =>
        Object.fromEntries(emitter.eventNames().map((name) => [name, emitter.listenerCount(name)]))
      const second = await f.controller.command(sender, {
        action: "create",
        directory: "/tmp/project",
        sessionID: "ses_second",
        url: "about:blank",
      })
      await f.controller.command(sender, { action: "bounds", id: second.id, x: 0, y: 0, width: 100, height: 100 })
      await f.controller.command(sender, { action: "show", id: second.id })
      await f.controller.command(sender, { action: "enable", id: second.id })
      const ownerListeners = baseline(owner)
      const senderListeners = baseline(sender)
      const timers = vi.getTimerCount()
      for (let index = 0; index < 200; index++) {
        await f.controller.command(sender, { action: "show", id: index % 2 ? status.id : second.id })
      }
      expect(baseline(owner)).toEqual(ownerListeners)
      expect(baseline(sender)).toEqual(senderListeners)
      expect(vi.getTimerCount()).toBe(timers)
      expect((await f.controller.command(sender, { action: "list" })).views).toHaveLength(2)
      expect(f.partitions.size).toBe(1)
      expect((await f.controller.command(sender, { action: "list" })).views.every((view) => view.enabled)).toBe(true)
      await f.controller.command(sender, { action: "show", id: second.id })
      f.pushStreamRequest({
        providerID: "provider-1",
        epoch: "boot",
        projectID: "project",
        sessionID: "ses_fixture",
        requestID: "pending",
        generation: "page",
        operation: "navigate",
        url: "https://must-not-run.test/",
        deadline: Date.now() + 30000,
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ waiting: true })
      // A held request replaces this provider's poll deadline with its request deadline.
      expect(vi.getTimerCount()).toBe(timers)
      await f.controller.closeAll()
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
      expect(owner.eventNames()).toHaveLength(0)
      expect(sender.eventNames()).toHaveLength(0)
      expect(f.guests.filter((guest) => guest.destroyed)).toHaveLength(f.guests.length)
      for (let index = 0; index < 20; index++) {
        const view = await f.controller.command(sender, {
          action: "create",
          directory: "/tmp/project",
          sessionID: `ses_churn${index}`,
          url: "about:blank",
        })
        await f.controller.command(sender, { action: "close", id: view.id })
      }
      expect(f.partitions.size).toBe(1)
      expect(owner.eventNames()).toHaveLength(0)
      expect(sender.eventNames()).toHaveLength(0)
      expect(vi.getTimerCount()).toBe(0)
      expect(f.controller.poolStats()).toEqual({
        liveViews: 0,
        shownWindows: 0,
        pendingCreates: 0,
        pendingGuestClears: 0,
        initializing: 0,
        partitions: 1,
      })
    } finally {
      vi.useRealTimers()
    }
  })
  test("enforces the configured live bound without LRU or a new partition on rejection", async () => {
    const f = fixture({ maxLiveViews: 1 })
    const { sender, status } = await f.create()
    await expect(
      f.controller.command(sender, {
        action: "create",
        directory: "/tmp/other",
        sessionID: "ses_other",
        url: "about:blank",
      }),
    ).rejects.toThrow("pool-full")
    expect(f.partitions.size).toBe(1)
    expect(f.guests).toHaveLength(1)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({ visible: true })
  })
})

test("closing the pool aborts an unfinished first load and drains its create and load timer", async () => {
  vi.useFakeTimers()
  try {
    const f = fixture({ loadTimeoutMs: 30000 })
    f.hangLoads(true)
    const creating = f.create({ attach: false })
    const rejected = expect(creating).rejects.toThrow("could not load")
    await vi.waitFor(() => expect(f.guests).toHaveLength(1))
    await f.controller.closeAll()
    await rejected
    expect(f.guests[0].destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    expect(f.controller.poolStats()).toMatchObject({ liveViews: 0, pendingCreates: 0, initializing: 0 })
  } finally {
    vi.useRealTimers()
  }
})

describe("WX-15 review fixes", () => {
  test("clearProject rejects foreign and shared profile ownership even after views close", async () => {
    const f = fixture()
    const first = await f.create()
    const second = await f.create()
    const clear = (sender) => f.controller.command(sender, { action: "clearProject", directory: "/tmp/project/" })
    await expect(clear(second.sender)).rejects.toThrow("another window")
    expect(f.guests.every((guest) => !guest.destroyed)).toBe(true)
    expect(first.sender.send).not.toHaveBeenCalled()
    await f.controller.command(first.sender, { action: "close", id: first.status.id })
    await expect(clear(second.sender)).rejects.toThrow("another window")
    await f.controller.command(second.sender, { action: "close", id: second.status.id })
    await expect(clear(second.sender)).rejects.toThrow("another window")
    expect([...f.partitions.values()][0].clearStorageData).not.toHaveBeenCalled()
    // A window with no ownership cannot wipe another project's retained profile.
    await f.controller.command(first.sender, {
      action: "create",
      directory: "/tmp/owned",
      sessionID: "ses_owned",
      url: "about:blank",
    })
    await expect(
      f.controller.command(second.sender, { action: "clearProject", directory: "/tmp/owned" }),
    ).rejects.toThrow("another window")
  })

  test("clearProject sends clearing and cleared states only to its owning pane", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "clearProject", directory: "/tmp/project" })
    expect(sender.send.mock.calls.map((call) => call[1].detail.error)).toEqual(["storage-clearing", "storage-cleared"])
    expect(sender.send).toHaveBeenLastCalledWith("ax-code:dom-event", {
      event: "openchamber:webmcp-storage",
      detail: {
        views: [{ id: status.id, directory: "/tmp/project", sessionID: "ses_fixture" }],
        error: "storage-cleared",
      },
    })
    expect(f.guests[0].destroyed).toBe(true)
  })

  test("failed storage clearing reports failure without claiming storage was cleared", async () => {
    const f = fixture()
    const { sender } = await f.create()
    ;[...f.partitions.values()][0].clearStorageData.mockRejectedValueOnce(new Error("fixture failure"))
    await expect(f.controller.command(sender, { action: "clearProject", directory: "/tmp/project" })).rejects.toThrow(
      "fixture failure",
    )
    expect(sender.send.mock.calls.map((call) => call[1].detail.error)).toEqual(["storage-clearing", "operation-failed"])
  })

  test("revoke waits behind create and clear and blocks the next create", async () => {
    const f = fixture({ holdRevocation: true })
    const { sender } = await f.create()
    let finishClear
    ;[...f.partitions.values()][0].clearStorageData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishClear = resolve
        }),
    )
    const clearing = f.controller.command(sender, { action: "clearProject", directory: "/tmp/project" })
    await vi.waitFor(() => expect(finishClear).toBeTypeOf("function"))
    let revoked = false
    const revoking = f.controller
      .command(sender, { action: "revokeSession", directory: "/tmp/project", sessionID: "ses_fixture" })
      .then(() => {
        revoked = true
      })
    await Promise.resolve()
    await Promise.resolve()
    expect(revoked).toBe(false)
    finishClear()
    await clearing
    await revoking
    const creating = f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_new",
      url: "about:blank",
    })
    const newRevoke = f.controller.command(sender, {
      action: "revokeSession",
      directory: "/tmp/project",
      sessionID: "ses_new",
    })
    const created = await creating
    await newRevoke
    await f.controller.command(sender, { action: "show", id: created.id })
    await f.controller.command(sender, { action: "bounds", id: created.id, x: 0, y: 0, width: 100, height: 100 })
    await f.controller.command(sender, { action: "enable", id: created.id })
    const pendingRevoke = f.controller.command(sender, {
      action: "revokeSession",
      directory: "/tmp/project",
      sessionID: "ses_new",
    })
    await vi.waitFor(() => expect(f.revocations).toHaveLength(1))
    const next = f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_next",
      url: "about:blank",
    })
    await Promise.resolve()
    expect(f.guests).toHaveLength(2)
    f.revocations.shift()({})
    await pendingRevoke
    await next
  })

  test("main reuses renderer-normalized path aliases", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const aliased = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project/child/../",
      sessionID: "ses_fixture",
      url: "about:blank",
    })
    expect(aliased.id).toBe(status.id)
    expect(f.guests).toHaveLength(1)
  })
})

test.each(["complete", "timeout", "pause", "disconnect", "revokeSession"])(
  "hidden executing native tool retains its deadline and explicit cancellation: %s",
  async (outcome) => {
    const f = fixture()
    const { sender, status } = await f.create()
    const guest = f.guests[0]
    const tool = { name: "slow", description: "A slow tool", frameId: "top", inputSchema: { type: "object" } }
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [tool] })
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    guest.debugger.sendCommand = vi.fn(async (method) =>
      method === "WebMCP.invokeTool" ? { invocationId: "slow-1" } : {},
    )
    f.pushStreamRequest({
      providerID: "provider-1",
      epoch: "boot",
      projectID: "project",
      sessionID: "ses_fixture",
      requestID: "slow-call",
      operation: "invoke",
      generation: live.generation,
      origin: "https://example.com",
      frameId: "top",
      deadline: Date.now() + (outcome === "timeout" ? 300 : 5000),
      toolName: "slow",
      digest: definitionDigest(tool),
      input: {},
    })
    await vi.waitFor(() =>
      expect(guest.debugger.sendCommand).toHaveBeenCalledWith("WebMCP.invokeTool", expect.anything()),
    )
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
    expect(guest.debugger.sendCommand.mock.calls.some(([method]) => method === "WebMCP.cancelInvocation")).toBe(false)
    if (outcome === "complete") {
      guest.debugger.emit("message", {}, "WebMCP.toolResponded", {
        invocationId: "slow-1",
        status: "Completed",
        output: { result: "done" },
      })
      await vi.waitFor(() =>
        expect(f.requests.find((r) => r.url.endsWith("/reply"))?.body).toMatchObject({
          requestID: "slow-call",
          status: "Completed",
        }),
      )
    } else if (outcome === "timeout") {
      await vi.waitFor(() =>
        expect(f.requests.find((r) => r.url.endsWith("/reply"))?.body).toMatchObject({
          requestID: "slow-call",
          status: "Error",
        }),
      )
      expect(guest.debugger.sendCommand).toHaveBeenCalledWith("WebMCP.cancelInvocation", { invocationId: "slow-1" })
    } else {
      const stopped = await f.controller.command(
        sender,
        outcome === "revokeSession"
          ? { action: outcome, directory: "/tmp/project", sessionID: "ses_fixture" }
          : { action: outcome, id: status.id },
      )
      expect(guest.debugger.sendCommand).toHaveBeenCalledWith("WebMCP.cancelInvocation", { invocationId: "slow-1" })
      expect(stopped).toMatchObject({
        stoppedCalls: 0,
        finishingCalls: 1,
        cancellations: [{ requestID: "slow-call", state: "still-finishing" }],
      })
      expect(replies(f).map((r) => r.body)).toEqual([
        expect.objectContaining({
          requestID: "slow-call",
          status: "Error",
          output: expect.objectContaining({ reason: outcome === "pause" ? "agent-paused" : "agent-disconnected" }),
        }),
      ])
      guest.debugger.emit("message", {}, "WebMCP.toolResponded", {
        invocationId: "slow-1",
        status: "Completed",
        output: "late success",
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(replies(f)).toHaveLength(1)
    }
  },
)

test("pooled status and list preserve each page generation, catalog bounds and rejection", async () => {
  const f = fixture()
  const { sender, status: first } = await f.create()
  const firstGuest = f.guests.at(-1)
  const second = await f.controller.command(sender, {
    action: "create",
    directory: "/tmp/project",
    sessionID: "ses_second",
    url: "https://second.test/",
  })
  const secondGuest = f.guests.at(-1)
  firstGuest.debugger.emit("message", {}, "WebMCP.toolsAdded", {
    tools: Array.from({ length: 65 }, (_, index) => ({ name: `tool_${index}`, description: "First", frameId: "top" })),
  })
  firstGuest.debugger.emit("message", {}, "WebMCP.toolsAdded", {
    tools: [
      { name: "echo", description: "One", frameId: "top" },
      { name: "echo", description: "Two", frameId: "top" },
    ],
  })
  secondGuest.debugger.emit("message", {}, "WebMCP.toolsAdded", {
    tools: [{ name: "second", description: "Second", frameId: "top" }],
  })
  const a = await f.controller.command(sender, { action: "status", id: first.id })
  const b = await f.controller.command(sender, { action: "status", id: second.id })
  expect(a).toMatchObject({
    generation: expect.any(String),
    catalogTotal: 65,
    catalogTruncation: "count",
    catalogRejection: { code: "invalid-catalog", reason: "duplicate-name", tool: "echo" },
  })
  expect(a.catalog).toHaveLength(64)
  expect(b).toMatchObject({
    generation: expect.any(String),
    catalogTotal: 1,
    catalogTruncation: null,
    catalogRejection: null,
  })
  expect(b.catalog[0]).toMatchObject({ name: "second", digest: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(a.generation).not.toBe(b.generation)
  expect((await f.controller.command(sender, { action: "list" })).views).toEqual([a, b])
  firstGuest.emit("did-start-navigation", {}, "https://example.com/new", false, true)
  expect((await f.controller.command(sender, { action: "status", id: first.id })).generation).not.toBe(a.generation)
  expect(await f.controller.command(sender, { action: "status", id: second.id })).toEqual(b)
})

describe("Round 14a LRU unload", () => {
  test("unloads the least recently used hidden idle page, keeps its full address only in memory and reloads with access off", async () => {
    const f = fixture({ maxLiveViews: 2 })
    const { sender, status: first } = await f.create()
    const address = "https://example.com/private?ticket=memory-only#section"
    await f.controller.command(sender, { action: "navigate", id: first.id, url: address })
    await f.controller.command(sender, { action: "enable", id: first.id })
    const second = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/other",
      sessionID: "ses_other",
      url: "https://other.test/",
    })
    await f.controller.command(sender, { action: "show", id: second.id })
    await f.controller.command(sender, { action: "bounds", id: second.id, x: 0, y: 0, width: 200, height: 200 })
    await f.controller.command(sender, { action: "enable", id: second.id })
    const third = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/third",
      sessionID: "ses_third",
      url: "https://third.test/",
    })
    expect(f.guests[0].destroyed).toBe(true)
    expect(f.guests[1].destroyed).toBe(false)
    expect(f.controller.poolStats().liveViews).toBe(2)
    const listing = await f.controller.command(sender, { action: "list" })
    expect(listing).toMatchObject({ maxLiveViews: 2, liveViews: 2 })
    expect(listing.views.find((view) => view.id === first.id)).toMatchObject({
      unloaded: true,
      enabled: false,
      paused: false,
      waiting: false,
    })
    expect(JSON.stringify(listing)).not.toContain("memory-only")
    expect(f.requests.filter((r) => r.method === "DELETE").map((r) => r.url)).toEqual([
      "/desktop/browser/provider/provider-1",
    ])
    // The selected second page remains intact; the hidden third page makes room for the first.
    const restored = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_fixture",
      url: "https://example.com/private",
    })
    await f.controller.command(sender, { action: "show", id: restored.id })
    expect(restored).toMatchObject({ id: first.id, url: address, unloaded: false, enabled: false, paused: false })
    expect(f.guests.at(-1).loadedUrls).toEqual([address])
    expect((await f.controller.command(sender, { action: "status", id: second.id })).enabled).toBe(true)
    expect((await f.controller.command(sender, { action: "status", id: third.id })).unloaded).toBe(true)
    expect(await f.controller.command(sender, { action: "show", id: third.id })).toMatchObject({
      url: "https://third.test/",
      unloaded: false,
      enabled: false,
      paused: false,
    })
    expect([...f.partitions.values()].every((partition) => partition.clearStorageData.mock.calls.length === 0)).toBe(
      true,
    )
    await f.controller.closeAll()
    expect((await f.controller.command(sender, { action: "list" })).views).toEqual([])
    expect(sender.eventNames()).toEqual([])
    expect(f.owners.get(sender).eventNames()).toEqual([])
  })

  test("LRU honors recent shows, never unloads a held call, and rejects a full busy pool", async () => {
    const f = fixture({ maxLiveViews: 2 })
    const { sender, status: first } = await f.create()
    const enabled = await f.controller.command(sender, { action: "enable", id: first.id })
    const second = await f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_second",
      url: "https://second.test/",
    })
    await f.controller.command(sender, { action: "show", id: second.id })
    await f.controller.command(sender, { action: "bounds", id: second.id, x: 0, y: 0, width: 200, height: 200 })
    f.pushStreamRequest(navigateRequest({ generation: enabled.generation }))
    await vi.waitFor(async () =>
      expect((await f.controller.command(sender, { action: "status", id: first.id })).waiting).toBe(true),
    )
    const createThird = () =>
      f.controller.command(sender, {
        action: "create",
        directory: "/tmp/project",
        sessionID: "ses_third",
        url: "https://third.test/",
      })
    await expect(createThird()).rejects.toThrow("pool-full")
    await f.controller.command(sender, { action: "revokeSession", directory: "/tmp/project", sessionID: "ses_fixture" })
    await f.controller.command(sender, { action: "show", id: first.id })
    await createThird()
    expect(f.guests[0].destroyed).toBe(false)
    expect(f.guests[1].destroyed).toBe(true)
  })
})

test("LRU chooses the oldest of multiple hidden pages and cleans unloaded records on window death", async () => {
  const f = fixture({ maxLiveViews: 3 })
  const { sender, status: first } = await f.create()
  const create = (name) =>
    f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: `ses_${name}`,
      url: `https://${name}.test/`,
    })
  const second = await create("second")
  const third = await create("third")
  const now = vi.spyOn(Date, "now")
  now.mockReturnValue(1000)
  await f.controller.command(sender, { action: "show", id: second.id })
  now.mockReturnValue(2000)
  await f.controller.command(sender, { action: "show", id: first.id })
  now.mockReturnValue(3000)
  await f.controller.command(sender, { action: "show", id: third.id })
  await f.controller.command(sender, { action: "bounds", id: third.id, x: 0, y: 0, width: 200, height: 200 })
  now.mockRestore()
  await create("fourth")
  expect(f.guests[0].destroyed).toBe(false)
  expect(f.guests[1].destroyed).toBe(true)
  expect((await f.controller.command(sender, { action: "status", id: second.id })).unloaded).toBe(true)
  const foreign = Object.assign(new EventEmitter(), { id: 99 })
  f.owners.set(foreign, f.owners.get(sender))
  await expect(f.controller.command(foreign, { action: "show", id: second.id })).rejects.toThrow("another window")
  await expect(
    f.controller.command(sender, { action: "close", id: second.id, sessionID: "ses_wrong" }),
  ).rejects.toThrow("session mismatch")
  sender.emit("render-process-gone")
  await vi.waitFor(async () => expect((await f.controller.command(sender, { action: "list" })).views).toEqual([]))
  expect(sender.eventNames()).toEqual([])
})

test("LRU does not unload a hidden manual invocation", async () => {
  const f = fixture({ maxLiveViews: 1 })
  const { sender, status } = await f.create()
  const guest = f.guests[0]
  const tool = { name: "held", frameId: "top", description: "Held tool", inputSchema: { type: "object" } }
  guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [tool] })
  guest.debugger.sendCommand = vi.fn(async (method) =>
    method === "WebMCP.invokeTool" ? { invocationId: "manual-held" } : {},
  )
  const invocation = f.controller.command(sender, { action: "tryTool", id: status.id, toolName: "held", input: {} })
  await vi.waitFor(async () =>
    expect((await f.controller.command(sender, { action: "status", id: status.id })).idle).toBe(false),
  )
  await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
  await expect(
    f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_other",
      url: "https://other.test/",
    }),
  ).rejects.toThrow("pool-full")
  expect(guest.destroyed).toBe(false)
  await f.controller.command(sender, { action: "disconnect", id: status.id })
  await invocation
})

test.each(["closed", "destroyed", "render-process-gone"])(
  "dormant cap and owner listeners stay flat after 100 evictions; cleanup on %s",
  async (event) => {
    const f = fixture({ maxLiveViews: 1 })
    const { sender, status: first } = await f.create({ attach: false })
    const owner = f.owners.get(sender)
    const ids = [first.id]
    const counts = () => [
      owner.listenerCount("closed"),
      sender.listenerCount("destroyed"),
      sender.listenerCount("render-process-gone"),
    ]
    for (let index = 0; index < 100; index++) {
      const view = await f.controller.command(sender, {
        action: "create",
        directory: "/tmp/project",
        sessionID: `ses_eviction${index}`,
        url: "https://example.com/",
      })
      ids.push(view.id)
      // One live entry and one dormant-owner listener, independent of record count.
      expect(counts()).toEqual([2, 2, 2])
    }
    const listing = await f.controller.command(sender, { action: "list" })
    expect(listing.views.filter((view) => view.unloaded).map((view) => view.id)).toEqual(ids.slice(-33, -1))
    expect(listing.views).toHaveLength(33)
    ;(event === "closed" ? owner : sender).emit(event)
    await vi.waitFor(async () => expect((await f.controller.command(sender, { action: "list" })).views).toEqual([]))
    expect(counts()).toEqual([0, 0, 0])
  },
)

test("a destroyed guest can be unloaded without reading its URL", async () => {
  const f = fixture({ maxLiveViews: 1 })
  const { sender, status } = await f.create({ attach: false })
  f.guests[0].destroyed = true
  f.guests[0].getURL = vi.fn(() => {
    throw new Error("Object has been destroyed")
  })
  await f.controller.command(sender, {
    action: "create",
    directory: "/tmp/project",
    sessionID: "ses_next",
    url: "about:blank",
  })
  expect(f.guests[0].getURL).not.toHaveBeenCalled()
  expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
    unloaded: true,
    enabled: false,
  })
})

test("a paused page keeps its connection when capacity is exhausted", async () => {
  const f = fixture({ maxLiveViews: 1 })
  const { sender, status } = await f.create()
  await f.controller.command(sender, { action: "enable", id: status.id })
  await f.controller.command(sender, { action: "pause", id: status.id })
  await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
  await expect(
    f.controller.command(sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_next",
      url: "about:blank",
    }),
  ).rejects.toThrow("pool-full")
  expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
    paused: true,
    unloaded: false,
  })
  expect(f.requests.filter((request) => request.method === "DELETE")).toEqual([])
})

test("a full pool exposes a focusable owner to another local window without granting page control", async () => {
  const f = fixture({ maxLiveViews: 2 })
  const first = await f.create()
  const second = await f.create()
  await expect(
    f.controller.command(second.sender, {
      action: "create",
      directory: "/tmp/project",
      sessionID: "ses_blocked",
      url: "about:blank",
    }),
  ).rejects.toThrow("pool-full")
  const listing = await f.controller.command(second.sender, { action: "list" })
  expect(listing.otherWindows).toEqual([{ id: first.status.id, pageCount: 1 }])
  expect(listing.views.map((view) => view.id)).toEqual([second.status.id])
  const owner = f.owners.get(first.sender)
  owner.isMinimized = () => true
  await f.controller.command(second.sender, { action: "focusOwner", id: listing.otherWindows[0].id })
  expect(owner.restore).toHaveBeenCalledOnce()
  expect(owner.show).toHaveBeenCalledOnce()
  expect(owner.focus).toHaveBeenCalledOnce()
  await expect(f.controller.command(second.sender, { action: "close", id: first.status.id })).rejects.toThrow(
    "another window",
  )
  await expect(f.controller.command(new EventEmitter(), { action: "focusOwner", id: first.status.id })).rejects.toThrow(
    "local desktop window",
  )
  await f.controller.command(first.sender, { action: "close", id: first.status.id })
  await expect(f.controller.command(second.sender, { action: "focusOwner", id: first.status.id })).rejects.toThrow(
    "unavailable",
  )
})

test("provider poll deadline interrupts access, retries, recovers and ignores a late timed-out batch", async () => {
  vi.useFakeTimers()
  const polls = []
  try {
    const f = fixture({
      pollTimeoutMs: 200,
      pollRetryMs: 50,
      nextPoll: (request) => new Promise((resolve) => polls.push({ request, resolve })),
    })
    const { sender, status } = await f.create()
    const enabled = await f.controller.command(sender, { action: "enable", id: status.id })
    await vi.advanceTimersByTimeAsync(201)
    expect(polls[0].request.signal.aborted).toBe(true)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      enabled: false,
      interrupted: true,
    })
    expect((await f.controller.command(sender, { action: "list" })).views[0]).toMatchObject({
      enabled: false,
      interrupted: true,
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(polls).toHaveLength(2)
    polls[0].resolve({ request: navigateRequest({ generation: enabled.generation, url: "https://late.test/" }) })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.guests[0].loadedUrls).not.toContain("https://late.test/")
    polls[1].resolve({ canceled: [] })
    await vi.advanceTimersByTimeAsync(0)
    expect(await f.controller.command(sender, { action: "status", id: status.id })).toMatchObject({
      enabled: true,
      interrupted: false,
    })
    expect(f.requests.filter((request) => request.url.endsWith("/provider"))).toHaveLength(1)
    expect(polls).toHaveLength(3)
    await f.controller.command(sender, { action: "disconnect", id: status.id })
    await vi.advanceTimersByTimeAsync(1000)
    expect(polls).toHaveLength(3)
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})

test("second-window create names the owner without disturbing its enabled page", async () => {
  const f = fixture()
  const first = await f.create()
  const second = await f.create()
  const enabled = await f.controller.command(first.sender, { action: "enable", id: first.status.id })
  const conflict = await f.controller.command(second.sender, {
    action: "create",
    directory: "/tmp/project",
    sessionID: "ses_fixture",
    url: "https://wrong.test",
  })
  expect(conflict).toEqual({ error: "owned-by-another-window", ownerId: first.status.id })
  await f.controller.command(second.sender, { action: "focusOwner", id: conflict.ownerId })
  expect(f.owners.get(first.sender).focus).toHaveBeenCalledOnce()
  expect(await f.controller.command(first.sender, { action: "status", id: first.status.id })).toMatchObject({
    enabled: true,
    generation: enabled.generation,
    url: enabled.url,
  })
  expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
  expect(f.requests.filter((request) => request.method === "DELETE")).toEqual([])
})

test.each(["pause", "disconnect", "revokeSession"])(
  "%s waits for the page acknowledgement before reporting a stopped call",
  async (action) => {
    const f = fixture()
    const { sender, status } = await f.create()
    const guest = f.guests[0]
    const tool = { name: "slow", description: "A slow tool", frameId: "top", inputSchema: { type: "object" } }
    guest.debugger.emit("message", {}, "WebMCP.toolsAdded", { tools: [tool] })
    const live = await f.controller.command(sender, { action: "enable", id: status.id })
    guest.debugger.sendCommand = vi.fn(async (method) =>
      method === "WebMCP.invokeTool" ? { invocationId: "awaited" } : {},
    )
    f.pushStreamRequest({
      providerID: "provider-1",
      epoch: "boot",
      projectID: "project",
      sessionID: "ses_fixture",
      requestID: "awaited-call",
      operation: "invoke",
      generation: live.generation,
      origin: "https://example.com",
      frameId: "top",
      deadline: Date.now() + 5000,
      toolName: "slow",
      digest: definitionDigest(tool),
      input: {},
    })
    await vi.waitFor(() =>
      expect(guest.debugger.sendCommand).toHaveBeenCalledWith("WebMCP.invokeTool", expect.anything()),
    )
    let returned = false
    const stopping = f.controller
      .command(
        sender,
        action === "revokeSession"
          ? { action, directory: "/tmp/project", sessionID: "ses_fixture" }
          : { action, id: status.id },
      )
      .then((result) => {
        returned = true
        return result
      })
    await vi.waitFor(() =>
      expect(guest.debugger.sendCommand).toHaveBeenCalledWith("WebMCP.cancelInvocation", { invocationId: "awaited" }),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(returned).toBe(false)
    expect(replies(f)).toHaveLength(0)
    guest.debugger.emit("message", {}, "WebMCP.toolResponded", { invocationId: "awaited", status: "Canceled" })
    expect(await stopping).toMatchObject({
      stoppedCalls: 1,
      finishingCalls: 0,
      cancellations: [{ requestID: "awaited-call", state: "stopped" }],
    })
    expect(replies(f)[0].body.output.cancellation).toBe("stopped")
    expect(guest.loadedUrls).toEqual(["https://example.com/"])
  },
)
