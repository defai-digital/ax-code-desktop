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

export async function loadWikiMaintenance(directory: string): Promise<WikiMaintenanceStatus | null> {
  try {
    const result = await wikiClient(directory).wiki.maintenance({ directory })
    if (result.error || !result.data) return null
    return result.data
  } catch {
    return null
  }
}

/**
 * Start or refresh wiki generation.
 *
 * The TUI's automatic wiki.enable() only attaches maintenance and does not call controller.request().
 * Opening /wiki-viz uses refresh, which attaches and schedules generation immediately (skipping the
 * idle delay). Both the Build wiki button and the toolbar refresh use this. Never call it from an effect.
 */
export async function requestWikiRefresh(directory: string): Promise<WikiMaintenanceStatus | null> {
  try {
    const result = await wikiClient(directory).wiki.refresh({
      directory,
      agent: WIKI_BUILD_AGENT,
      active: false,
    })
    if (result.error || !result.data) return null
    return result.data
  } catch {
    return null
  }
}
