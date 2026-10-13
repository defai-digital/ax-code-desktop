import { useMcpConfigStore } from "@/stores/useMcpConfigStore"
import { useMcpStore } from "@/stores/useMcpStore"

/**
 * AX Code ships two WebMCP paths: the Chrome bridge (a `webmcp`-profiled MCP server that launches
 * an isolated Chrome) and the desktop provider (this app's embedded project browser). While a
 * connected bridge exists the runtime's system prompt steers the agent to it, so enabling agent
 * access in the project browser would still open Chrome. This module pauses connected bridge
 * servers for the project while the embedded browser is enrolled and reconnects exactly those
 * servers afterwards. Nothing here changes configuration; it only connects and disconnects.
 */
const pausedByDirectory = new Map<string, string[]>()

const directoryKey = (directory: string | null | undefined): string => (directory ?? "").trim().replace(/[\\/]+$/, "")

/** A server is a Chrome bridge when it carries a `webmcp` profile or is the pre-registered `webmcp` entry. */
export const isChromeBridgeServer = (server: { name: string; webmcp?: unknown }): boolean =>
  server.name === "webmcp" || (typeof server.webmcp === "object" && server.webmcp !== null)

export function pausedChromeBridgeServers(directory: string | null | undefined): string[] {
  return [...(pausedByDirectory.get(directoryKey(directory)) ?? [])]
}

/** Disconnects every connected Chrome bridge for the directory and remembers which ones to restore. */
export async function pauseChromeBridgeForProjectBrowser(directory: string): Promise<string[]> {
  const key = directoryKey(directory)
  const servers = useMcpConfigStore.getState().mcpServers as Array<{ name: string; webmcp?: unknown }>
  const status = useMcpStore.getState().getStatusForDirectory(directory)
  const connected = servers
    .filter((server) => isChromeBridgeServer(server))
    .map((server) => server.name)
    .filter((name) => status[name]?.status === "connected")
  if (connected.length === 0) return pausedChromeBridgeServers(directory)
  const paused = new Set(pausedByDirectory.get(key) ?? [])
  for (const name of connected) {
    try {
      await useMcpStore.getState().disconnect(name, directory)
      paused.add(name)
    } catch (error) {
      console.warn("[webmcp] could not pause the Chrome bridge", name, error)
    }
  }
  pausedByDirectory.set(key, [...paused])
  return [...paused]
}

/** Reconnects the bridges that were paused for the directory, then forgets them. */
export async function resumeChromeBridgeForProjectBrowser(directory: string): Promise<void> {
  const key = directoryKey(directory)
  const names = pausedByDirectory.get(key) ?? []
  pausedByDirectory.delete(key)
  for (const name of names) {
    try {
      await useMcpStore.getState().connect(name, directory)
    } catch (error) {
      console.warn("[webmcp] could not resume the Chrome bridge", name, error)
    }
  }
}

/** Test seam: forget every paused bridge without touching the runtime. */
export function resetChromeBridgeCoordinationForTests(): void {
  pausedByDirectory.clear()
}
