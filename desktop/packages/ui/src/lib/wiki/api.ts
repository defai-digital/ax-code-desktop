import type { WikiMaintenanceStatus } from "@defai-digital/ax-code-sdk/v2"

import { axCodeClient } from "@/lib/ax-code/client"
import { normalizeProjectPath } from "@/lib/projectResolution"

import { classifyWikiVisualization, type WikiLoadState } from "./snapshot"

/** Agent name the TUI sends when the user explicitly asks for generation. */
export const WIKI_BUILD_AGENT = "build"

export const WIKI_MAINTENANCE_POLL_MS = 1500

export function wikiClient(directory: string | null | undefined) {
  const normalized = normalizeProjectPath(directory)
  if (!normalized) return axCodeClient.getApiClient()
  return axCodeClient.getScopedApiClient(normalized)
}

export async function loadWikiVisualization(directory: string): Promise<WikiLoadState> {
  try {
    const result = await wikiClient(directory).wiki.visualization({ directory })
    if (result.error) return classifyWikiVisualization({ error: result.error })
    return classifyWikiVisualization({ data: result.data })
  } catch (error) {
    return classifyWikiVisualization({ error })
  }
}

/**
 * Why maintenance reported itself as disabled: switched off, blocked by the permission
 * rules, or outside a Git worktree. The runtime sends no other reasons in this phase.
 */
export type WikiMaintenanceDisabledReason = "disabled" | "permissions" | "non_git"

/** Maintenance status read. A disabled project keeps the reported reason instead of `null`. */
export type WikiMaintenanceResult =
  | { status: "reported"; maintenance: WikiMaintenanceStatus }
  | { status: "disabled"; maintenance: WikiMaintenanceStatus; reason: WikiMaintenanceDisabledReason }
  | { status: "failed" }

/** Explicit refresh request. `disabled` means the runtime accepted the call but will not build. */
export type WikiRefreshOutcome =
  | { status: "started"; maintenance: WikiMaintenanceStatus }
  | { status: "disabled"; maintenance: WikiMaintenanceStatus; reason: WikiMaintenanceDisabledReason }
  | { status: "failed" }

function disabledReason(status: WikiMaintenanceStatus): WikiMaintenanceDisabledReason | null {
  if (status.phase !== "disabled") return null
  if (status.reason === "permissions" || status.reason === "non_git") return status.reason
  return "disabled"
}

export async function loadWikiMaintenance(directory: string): Promise<WikiMaintenanceResult> {
  try {
    const result = await wikiClient(directory).wiki.maintenance({ directory })
    if (result.error || !result.data) return { status: "failed" }
    const reason = disabledReason(result.data)
    if (reason) return { status: "disabled", maintenance: result.data, reason }
    return { status: "reported", maintenance: result.data }
  } catch {
    return { status: "failed" }
  }
}

/**
 * Start or refresh wiki generation.
 *
 * The TUI's automatic wiki.enable() only attaches maintenance and does not call controller.request().
 * Opening /wiki-viz uses refresh, which attaches and schedules generation immediately (skipping the
 * idle delay). Both the Build wiki button and the toolbar refresh use this. Never call it from an effect.
 *
 * A `disabled` status means nothing was queued: the caller must not report the refresh as started.
 */
export async function requestWikiRefresh(directory: string): Promise<WikiRefreshOutcome> {
  try {
    const result = await wikiClient(directory).wiki.refresh({
      directory,
      agent: WIKI_BUILD_AGENT,
      active: false,
    })
    if (result.error || !result.data) return { status: "failed" }
    const reason = disabledReason(result.data)
    if (reason) return { status: "disabled", maintenance: result.data, reason }
    return { status: "started", maintenance: result.data }
  } catch {
    return { status: "failed" }
  }
}

/** Failure classes `desktop_open_wiki_viewer` reports instead of its private child output. */
export type WikiViewerFailure = "runtime_unavailable" | "wiki_missing" | "export_incompatible" | "failed"

export type WikiViewerResult = { opened: true } | { opened: false; failure: WikiViewerFailure }

function isWikiViewerFailure(value: unknown): value is WikiViewerFailure {
  return (
    value === "runtime_unavailable" || value === "wiki_missing" || value === "export_incompatible" || value === "failed"
  )
}

/**
 * Normalize the viewer IPC result at the boundary. The main process returns a code, never a
 * message, so the renderer can localize it; an unknown shape stays a generic failure instead of
 * rendering whatever text arrived.
 */
export function classifyWikiViewerResult(value: unknown): WikiViewerResult {
  if (!value || typeof value !== "object") return { opened: false, failure: "failed" }
  const record = value as { opened?: unknown; failure?: unknown }
  if (record.opened === true) return { opened: true }
  return { opened: false, failure: isWikiViewerFailure(record.failure) ? record.failure : "failed" }
}
