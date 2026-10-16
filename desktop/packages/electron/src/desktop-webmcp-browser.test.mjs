import { afterEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import { createDesktopWebMcpBrowser } from "./desktop-webmcp-browser.js"

const controllers = []
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((controller) => controller.closeAll()))
})

function fixture({ capability = "desktop.webmcp.v1", browserMode = "embedded", holdRevocation = false } = {}) {
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
      contents.setWindowOpenHandler = vi.fn()
      contents.loadedUrls = []
      contents.loadURL = async (url) => {
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
    loadTimeoutMs: 20,
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
          return nextStreamRequest(request.signal).then((next) => ({ request: next, canceled: [] }))
        if (request.method === "DELETE" && holdRevocation) return new Promise((resolve) => revocations.push(resolve))
        return Promise.resolve({})
      },
    }),
  })
  controllers.push(controller)
  const create = async () => {
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
      sessionID: "ses_fixture",
      url: "https://example.com/",
    })
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

  it("loads the requested page and replies with the document it opened", async () => {
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

  it("refuses a URL the pane cannot open and replies with an error status", async () => {
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

  it("mirrors the runtime's navigation rule: loopback http opens, other http does not", async () => {
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
      expect(
        f.requests.some((request) => request.url.endsWith("/reply") && request.body.requestID === "req-lan"),
      ).toBe(true)
    })
    const lanReply = f.requests.find(
      (request) => request.url.endsWith("/reply") && request.body.requestID === "req-lan",
    ).body
    expect(lanReply).toMatchObject({ requestID: "req-lan", status: "Error" })
    expect(f.guests.at(-1).loadedUrls).not.toContain("http://192.168.1.10:3000/app")
  })
})

describe("desktop WebMCP capability probe", () => {
  it("reports a compatible runtime without creating a browser", async () => {
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

  it("reports an incompatible runtime as a status, not an error", async () => {
    const { controller, owners } = fixture({ capability: "desktop.webmcp.v0" })
    const sender = Object.assign(new EventEmitter(), { id: 98, getZoomFactor: () => 1 })
    owners.set(sender, { isDestroyed: () => false })
    const result = await controller.command(sender, { action: "capability", directory: "/tmp/project" })
    expect(result).toMatchObject({ compatible: false, runtimeCapability: "desktop.webmcp.v0" })
  })

  it("rejects old or Chrome-mode runtimes before enrolling an embedded provider", async () => {
    for (const browserMode of [null, "chrome"]) {
      const { controller, owners, requests, create } = fixture({ browserMode })
      const sender = Object.assign(new EventEmitter(), { id: 98, getZoomFactor: () => 1 })
      owners.set(sender, { isDestroyed: () => false })
      const result = await controller.command(sender, { action: "capability", directory: "/tmp/project" })
      expect(result.compatible).toBe(false)
      const browser = await create()
      await expect(controller.command(browser.sender, { action: "enable", id: browser.status.id })).rejects.toThrow(
        "compatible browser update",
      )
      expect(requests.some((request) => request.method === "POST")).toBe(false)
    }
  })

  it("reports an unreachable runtime as unknown rather than incompatible", async () => {
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
      compatible: false,
      runtimeCapability: null,
    })
    expect(controller).toBeTruthy()
  })

  it("refuses the probe for a sender without a desktop window", async () => {
    const { controller } = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 96, getZoomFactor: () => 1 })
    await expect(controller.command(sender, { action: "capability", directory: "/tmp/project" })).rejects.toThrow(
      "local desktop window",
    )
  })

  it("rejects relative directories for the probe", async () => {
    const { controller, owners } = fixture()
    const sender = Object.assign(new EventEmitter(), { id: 97, getZoomFactor: () => 1 })
    owners.set(sender, { isDestroyed: () => false })
    await expect(controller.command(sender, { action: "capability", directory: "project" })).rejects.toThrow(
      "Select a project",
    )
  })
})

describe("native project browser integration", () => {
  it("rejects another window using an enrolled browser ID", async () => {
    const f = fixture()
    const first = await f.create()
    const second = await f.create()
    await expect(f.controller.command(second.sender, { action: "status", id: first.status.id })).rejects.toThrow(
      "another window",
    )
  })

  it("keeps agent access disabled when the signed runtime lacks the capability", async () => {
    const f = fixture({ capability: "unsupported" })
    const { sender, status } = await f.create()
    await expect(f.controller.command(sender, { action: "enable", id: status.id })).rejects.toThrow(
      "compatible browser update",
    )
    expect((await f.controller.command(sender, { action: "status", id: status.id })).enabled).toBe(false)
    expect(f.requests.some((request) => request.method === "POST")).toBe(false)
  })

  it("closes every guest before waiting for slow runtime revocation acknowledgments", async () => {
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

  it("serializes concurrent creates for one window so the loser cannot orphan its view", async () => {
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

  it("revokes agent access when the page adapter dies", async () => {
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

  it("reconciles the tool catalog with the runtime when enrollment completes", async () => {
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

  it("fails a first load that never settles instead of leaving the pane without an id", async () => {
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

  it("refuses a command aimed at a pane whose view is already gone", async () => {
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

  it("fails a navigation that never settles instead of leaving the pane busy", async () => {
    const f = fixture()
    const { sender, status } = await f.create()

    f.hangLoads(true)

    await expect(
      f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org/next" }),
    ).rejects.toThrow("failed to load within")
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

  it("reads the page and replies with its text and outline", async () => {
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

  it("pushes the new document before replying to an action that navigated", async () => {
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

  it("answers an action on stale references with an error status", async () => {
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
