import { redactWebMcpText } from "../../../../shared/webmcp-redaction.mjs"
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
// Bumped by every resume and only *read* by a pause. A pause that observes a newer value while its
// disconnects are in flight knows a resume overtook it and must put back what it disconnected.
// Pauses used to bump the same counter, so a second pause looked like a resume: the first one
// reconnected the bridge it had just disconnected and recorded no pause — leaving the embedded
// browser enrolled with the Chrome bridge still connected, the conflict this module exists to
// prevent, with nothing left to restore.
const resumeEpochByDirectory = new Map<string, number>()

const bumpResumeEpoch = (key: string): number => {
  const next = (resumeEpochByDirectory.get(key) ?? 0) + 1
  resumeEpochByDirectory.set(key, next)
  return next
}

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
  const epoch = resumeEpochByDirectory.get(key) ?? 0
  const servers = useMcpConfigStore.getState().mcpServers as Array<{ name: string; webmcp?: unknown }>
  const status = useMcpStore.getState().getStatusForDirectory(directory)
  const connected = servers
    .filter((server) => isChromeBridgeServer(server))
    .map((server) => server.name)
    .filter((name) => status[name]?.status === "connected")
  if (connected.length === 0) return pausedChromeBridgeServers(directory)
  const paused = new Set(pausedByDirectory.get(key) ?? [])
  const disconnectedHere: string[] = []
  for (const name of connected) {
    try {
      await useMcpStore.getState().disconnect(name, directory)
      paused.add(name)
      disconnectedHere.push(name)
    } catch (error) {
      console.warn("[webmcp] could not pause the Chrome bridge", redactWebMcpText(name), redactWebMcpText(String(error)))
    }
  }

  if ((resumeEpochByDirectory.get(key) ?? 0) !== epoch) {
    // A resume ran while we were disconnecting: its intent wins, so put back what
    // this pause disconnected instead of recording a pause nobody will lift.
    for (const name of disconnectedHere) {
      try {
        await useMcpStore.getState().connect(name, directory)
      } catch (error) {
        console.warn("[webmcp] could not restore the Chrome bridge", redactWebMcpText(name), redactWebMcpText(String(error)))
      }
    }
    return pausedChromeBridgeServers(directory)
  }

  pausedByDirectory.set(key, [...paused])
  return [...paused]
}

/** Reconnects the bridges that were paused for the directory, then forgets them. */
export async function resumeChromeBridgeForProjectBrowser(directory: string): Promise<void> {
  const key = directoryKey(directory)
  // Invalidate any pause still in flight for this directory.
  bumpResumeEpoch(key)
  const names = pausedByDirectory.get(key) ?? []
  pausedByDirectory.delete(key)
  for (const name of names) {
    try {
      await useMcpStore.getState().connect(name, directory)
    } catch (error) {
      console.warn("[webmcp] could not resume the Chrome bridge", redactWebMcpText(name), redactWebMcpText(String(error)))
    }
  }
}

/** Test seam: forget every paused bridge without touching the runtime. */
export function resetChromeBridgeCoordinationForTests(): void {
  pausedByDirectory.clear()
  resumeEpochByDirectory.clear()
}
