import { afterEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import { createDesktopWebMcpBrowser } from "./desktop-webmcp-browser.js"

const controllers = []
afterEach(async () => {
  await Promise.all(controllers.splice(0).map((controller) => controller.closeAll()))
})

function fixture({ capability = "desktop.webmcp.v1", holdRevocation = false } = {}) {
  const owners = new Map()
  const guests = []
  const revocations = []
  let provider = 0
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
        if (request.url.endsWith("/capability")) return Promise.resolve({ capability })
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
  return { controller, create, requests, guests, revocations }
}

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
})
