import { describe, expect, it } from "vitest"

import { createRequestSecurityRuntime } from "./request-security.js"
import { createMockRequest } from "../../test-helpers/route-harness.js"

const createRuntime = () => createRequestSecurityRuntime({ env: {} })

describe("request security origin checks", () => {
  it("normalizes host casing before comparing origins", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "LOCALHOST:3000",
          origin: "http://localhost:3000",
        }),
      ),
    ).resolves.toBe(true)
  })

  it("trims origin headers before comparing origins", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "localhost:3000",
          origin: " http://localhost:3000 ",
        }),
      ),
    ).resolves.toBe(true)
  })

  it("treats IPv6 loopback host headers as localhost equivalents", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "[::1]:3000",
          origin: "http://localhost:3000",
        }),
      ),
    ).resolves.toBe(true)
  })

  it("keeps non-loopback origins rejected", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "[::1]:3000",
          origin: "http://example.com:3000",
        }),
      ),
    ).resolves.toBe(false)
  })

  it("rejects spoofed forwarded host and protocol headers", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "localhost:3902",
          origin: "https://desktop.example.com",
          protocol: "http",
          forwardedHost: "desktop.example.com",
          forwardedProto: "https",
        }),
      ),
    ).resolves.toBe(false)
  })

  it("rejects a stale public origin from pre-local-only settings", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "localhost:3902",
          origin: "https://desktop.example.com",
        }),
      ),
    ).resolves.toBe(false)
  })

  it("rejects matching non-loopback Host and Origin headers", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "desktop.example.com",
          origin: "http://desktop.example.com",
        }),
      ),
    ).resolves.toBe(false)
  })

  it("allows requests without an Origin header (non-browser clients)", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "localhost:3000",
        }),
      ),
    ).resolves.toBe(true)
  })

  it("allows the packaged app://ax-code renderer origin", async () => {
    const runtime = createRuntime()

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({
          host: "127.0.0.1:3902",
          origin: "app://ax-code",
        }),
      ),
    ).resolves.toBe(true)
  })

  it("allows the registered dev renderer on another loopback port", async () => {
    const request = createMockRequest({ host: "127.0.0.1:3001", origin: "http://localhost:5173", localPort: 3001 })

    await expect(
      createRequestSecurityRuntime({ env: { AX_CODE_DESKTOP_RENDERER_PORT: "5173" } }).isRequestOriginAllowed(request),
    ).resolves.toBe(true)
    await expect(
      createRequestSecurityRuntime({
        env: { AX_CODE_DESKTOP_ELECTRON_RENDERER_URL: "http://127.0.0.1:5173/" },
      }).isRequestOriginAllowed(request),
    ).resolves.toBe(true)
  })

  it("rejects another local server's page on a different loopback port", async () => {
    // Any loopback origin was trusted, so an untrusted project's dev server could open the event stream and
    // terminal sockets of this server from the user's browser.
    const runtime = createRequestSecurityRuntime({ env: {} })

    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({ host: "127.0.0.1:3001", origin: "http://localhost:5173", localPort: 3001 }),
      ),
    ).resolves.toBe(false)
    // A forged Host cannot stand in for the port the connection really reached.
    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({ host: "127.0.0.1:5173", origin: "http://localhost:5173", localPort: 3001 }),
      ),
    ).resolves.toBe(false)
    await expect(
      runtime.isRequestOriginAllowed(
        createMockRequest({ host: "localhost:3001", origin: "http://[::1]:3001", localPort: 3001 }),
      ),
    ).resolves.toBe(true)
  })
})

describe("unclaimed WebSocket upgrades", () => {
  const createSocket = () => {
    const writes = []
    return {
      writes,
      destroyed: false,
      write(chunk) {
        writes.push(chunk)
      },
      destroy() {
        this.destroyed = true
      },
    }
  }

  it("answers upgrades no feature runtime claimed with a 404 close", () => {
    const runtime = createRuntime()
    const socket = createSocket()

    runtime.rejectUnclaimedWebSocketUpgrade(socket)

    expect(socket.writes.join("")).toContain("HTTP/1.1 404 Not Found")
    expect(socket.destroyed).toBe(true)
  })

  it("leaves claimed or already-closed sockets to their owners", () => {
    const runtime = createRuntime()
    const claimed = createSocket()
    const closed = createSocket()

    runtime.markWebSocketUpgradeClaimed(claimed)
    runtime.rejectUnclaimedWebSocketUpgrade(claimed)
    closed.destroy()
    runtime.rejectUnclaimedWebSocketUpgrade(closed)

    expect(claimed.writes).toEqual([])
    expect(claimed.destroyed).toBe(false)
    expect(closed.writes).toEqual([])
  })
})
