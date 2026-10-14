import { afterEach, describe, expect, test, vi } from "vitest"
import {
  isChromeBridgeServer,
  pauseChromeBridgeForProjectBrowser,
  pausedChromeBridgeServers,
  resetChromeBridgeCoordinationForTests,
  resumeChromeBridgeForProjectBrowser,
} from "./webMcpBridgeCoordination"
import { useMcpConfigStore } from "@/stores/useMcpConfigStore"
import { useMcpStore } from "@/stores/useMcpStore"

const configSnapshot = useMcpConfigStore.getState()
const statusSnapshot = useMcpStore.getState()

afterEach(() => {
  useMcpConfigStore.setState(configSnapshot, true)
  useMcpStore.setState(statusSnapshot, true)
  resetChromeBridgeCoordinationForTests()
})

const servers = [
  { name: "webmcp", type: "local", command: ["npx"], enabled: true, webmcp: { read: true } },
  { name: "custom-bridge", type: "remote", url: "https://bridge.example", enabled: true, webmcp: {} },
  { name: "github", type: "remote", url: "https://mcp.github.com", enabled: true },
]

describe("Chrome bridge coordination", () => {
  test("recognises bridge servers by profile or the pre-registered name", () => {
    expect(isChromeBridgeServer({ name: "webmcp" })).toBe(true)
    expect(isChromeBridgeServer({ name: "other", webmcp: { read: true } })).toBe(true)
    expect(isChromeBridgeServer({ name: "github" })).toBe(false)
  })

  test("pauses only connected bridges and resumes exactly those", async () => {
    const disconnect = vi.fn(async () => {})
    const connect = vi.fn(async () => {})
    useMcpConfigStore.setState({ mcpServers: servers as never })
    useMcpStore.setState({
      disconnect,
      connect,
      getStatusForDirectory: () =>
        ({
          webmcp: { status: "connected" },
          "custom-bridge": { status: "failed", error: "boom" },
          github: { status: "connected" },
        }) as never,
    })

    await expect(pauseChromeBridgeForProjectBrowser("/Users/dev/app")).resolves.toEqual(["webmcp"])
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledWith("webmcp", "/Users/dev/app")
    expect(pausedChromeBridgeServers("/Users/dev/app/")).toEqual(["webmcp"])

    await resumeChromeBridgeForProjectBrowser("/Users/dev/app")
    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledWith("webmcp", "/Users/dev/app")
    expect(pausedChromeBridgeServers("/Users/dev/app")).toEqual([])
  })

  test("a resume during the pause's disconnects restores the bridge instead of stranding it", async () => {
    // Regression: resume ran first (nothing recorded yet, so it reconnected nothing),
    // then the in-flight pause recorded the bridge as paused — disconnected for the
    // rest of the session with nothing left to resume it.
    let releaseDisconnect: () => void = () => {}
    const disconnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseDisconnect = resolve
        }),
    )
    const connect = vi.fn(async () => {})
    useMcpConfigStore.setState({ mcpServers: servers as never })
    useMcpStore.setState({
      disconnect,
      connect,
      getStatusForDirectory: () => ({ webmcp: { status: "connected" } }) as never,
    })

    const pausing = pauseChromeBridgeForProjectBrowser("/Users/dev/app")
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1))
    await resumeChromeBridgeForProjectBrowser("/Users/dev/app")
    releaseDisconnect()
    await pausing

    expect(pausedChromeBridgeServers("/Users/dev/app")).toEqual([])
    expect(connect).toHaveBeenCalledWith("webmcp", "/Users/dev/app")
  })

  test("does nothing when no bridge is connected", async () => {
    const disconnect = vi.fn(async () => {})
    useMcpConfigStore.setState({ mcpServers: servers as never })
    useMcpStore.setState({ disconnect, getStatusForDirectory: () => ({}) as never })
    await expect(pauseChromeBridgeForProjectBrowser("/Users/dev/app")).resolves.toEqual([])
    expect(disconnect).not.toHaveBeenCalled()
  })
})
