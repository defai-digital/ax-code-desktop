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
      contents.setWindowOpenHandler = vi.fn()
      contents.loadURL = async (url) => {
        if (hangLoad) return new Promise(() => {})
        contents.url = url
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
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
          })
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
    guests,
    revocations,
    owners,
    hangLoads: (value) => {
      hangLoad = value
    },
  }
}

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

  it("fails a navigation that never settles instead of leaving the pane busy", async () => {
    const f = fixture()
    const { sender, status } = await f.create()

    f.hangLoads(true)

    await expect(
      f.controller.command(sender, { action: "navigate", id: status.id, url: "https://example.org/next" }),
    ).rejects.toThrow("failed to load within")
  })
})
