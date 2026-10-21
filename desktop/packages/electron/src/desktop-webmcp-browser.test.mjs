import { afterEach, describe, expect, test, vi } from "vitest"
import { EventEmitter } from "node:events"
import { createDesktopWebMcpBrowser } from "./desktop-webmcp-browser.js"

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
} = {}) {
  const owners = new Map()
  const guests = []
  const revocations = []
  let provider = 0
  // Set by a test before a load to model a guest whose loadURL never settles: a
  // server that accepts TCP and never answers would leave the pane starting
  // forever without the load deadline.
  let hangLoad = false
  class View {
    constructor() {
      this.webContents = new EventEmitter()
      const contents = this.webContents
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
  const streamRequests = []
  const streamWaiters = []
  const pushStreamRequest = (request) => {
    const waiter = streamWaiters.shift()
    if (waiter) waiter(request)
    else streamRequests.push(request)
  }
  const nextStreamRequest = (signal) =>
    new Promise((resolve, reject) => {
      const queued = streamRequests.shift()
      if (queued) {
        resolve(queued)
        return
      }
      const waiter = (request) => resolve(request)
      streamWaiters.push(waiter)
      signal?.addEventListener(
        "abort",
        () => {
          const index = streamWaiters.indexOf(waiter)
          if (index >= 0) streamWaiters.splice(index, 1)
          reject(new Error("aborted"))
        },
        { once: true },
      )
    })
  const controller = createDesktopWebMcpBrowser({
    BrowserWindow: { fromWebContents: (sender) => owners.get(sender) },
    WebContentsView: View,
    // Short deadline so the hang tests stay fast.
    loadTimeoutMs,
    attachTimeoutMs,
    session: {
      fromPartition: () =>
        Object.assign(new EventEmitter(), {
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {},
        }),
    },
    getRuntime: () => "http://127.0.0.1:31418",
    getAuthorization: () => "Basic fixture",
    providerToken: "fixture-only-token",
    clientFactory: () => ({
      request: (request) => {
        requests.push(request)
        if (request.url.endsWith("/capability")) return Promise.resolve({ capability, browserMode })
        if (request.url.endsWith("/provider"))
          return Promise.resolve({
            providerID: `provider-${++provider}`,
            epoch: "boot",
            projectID: "project",
          })
        if (request.url.endsWith("/next"))
          return nextStreamRequest(request.signal).then((next) => next.batch ?? { request: next, canceled: [] })
        if (request.method === "DELETE" && holdRevocation) return new Promise((resolve) => revocations.push(resolve))
        return Promise.resolve({})
      },
    }),
  })
  controllers.push(controller)
  const create = async ({ attach = true, sessionID = "ses_fixture" } = {}) => {
    const sender = Object.assign(new EventEmitter(), { id: owners.size + 1, getZoomFactor: () => 1 })
    const owner = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: () => true,
      isMinimized: () => false,
      getContentBounds: () => ({ width: 800, height: 600 }),
      contentView: { addChildView() {}, removeChildView() {} },
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

describe("desktop WebMCP navigation requests", () => {
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

  test.each(["pause", "cancel"])("stops an in-flight agent load on %s without replay", async (action) => {
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
    if (action === "pause") {
      await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
    } else {
      const polls = f.requests.filter((r) => r.url.endsWith("/next")).length
      f.pushStreamRequest({ batch: { canceled: ["req-navigate"] } })
      await vi.waitFor(() => expect(f.requests.filter((r) => r.url.endsWith("/next")).length).toBeGreaterThan(polls))
    }
    expect(guest.stop).toHaveBeenCalledTimes(1)
    finish()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(guest.getURL()).toBe("https://example.com/")
    expect(f.requests.some((r) => r.url.endsWith("/reply"))).toBe(false)
    if (action === "pause") {
      await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 100, height: 100 })
      await f.controller.command(sender, { action: "resume", id: status.id })
    }
    expect(guest.loadURL).toHaveBeenCalledTimes(1)
  })

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
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
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
    expect(f.revocations).toHaveLength(2)
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

    expect(first.id).not.toBe(second.id)
    // The first pane was replaced and closed by the second; nothing is left attached.
    expect(f.guests).toHaveLength(2)
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
  const replies = (f) => f.requests.filter((request) => request.url.endsWith("/reply"))

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
  test("pauses without losing the page and resumes only with a fresh explicit enrollment", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    const enabled = await f.controller.command(sender, { action: "enable", id: status.id })
    const paused = await f.controller.command(sender, {
      action: "bounds",
      id: status.id,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    })
    expect(paused).toMatchObject({ paused: true, enabled: false, url: enabled.url })
    expect(paused.generation).not.toBe(enabled.generation)
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
    expect(resumed.generation).not.toBe(paused.generation)
    expect(f.requests.filter((r) => r.url.endsWith("/capability"))).toHaveLength(2)
    expect(f.requests.filter((r) => r.url.endsWith("/reply"))).toHaveLength(0)
  })

  test("drops a late poll before executing a request after pause", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    f.pushStreamRequest({
      providerID: "provider-1",
      epoch: "boot",
      projectID: "project",
      sessionID: "ses_fixture",
      operation: "navigate",
      requestID: "retired",
      url: "https://example.org/must-not-open",
    })
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 0, height: 0 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
    await f.controller.command(sender, { action: "bounds", id: status.id, x: 0, y: 0, width: 100, height: 100 })
    await f.controller.command(sender, { action: "resume", id: status.id })
    expect(f.guests[0].loadedUrls).toEqual(["https://example.com/"])
    expect(f.requests.some((r) => r.url.endsWith("/reply"))).toBe(false)
  })

  test("revalidates runtime compatibility on resume and leaves access paused on failure", async () => {
    const f = fixture()
    const { sender, status } = await f.create()
    await f.controller.command(sender, { action: "enable", id: status.id })
    f.owners.get(sender).emit("hide")
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
    expect(listed.catalog).toEqual([{ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }])

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
