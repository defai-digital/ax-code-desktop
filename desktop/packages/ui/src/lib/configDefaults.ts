import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"
import { API_ENDPOINTS } from "./http"
import { isPlainRecord } from "./record"

export interface ConfigDefaults {
  defaultModel?: string
  defaultVariant?: string
  defaultAgent?: string
  autoCreateWorktree?: boolean
  gitmojiEnabled?: boolean
  defaultFileViewerPreview?: boolean
  zenModel?: string
}

const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  return value.trim() || undefined
}

const parseConfigDefaults = (value: unknown): ConfigDefaults => {
  if (!isPlainRecord(value)) return {}
  return {
    defaultModel: optionalString(value.defaultModel),
    defaultVariant: optionalString(value.defaultVariant),
    defaultAgent: optionalString(value.defaultAgent),
    autoCreateWorktree: typeof value.autoCreateWorktree === "boolean" ? value.autoCreateWorktree : undefined,
    gitmojiEnabled: typeof value.gitmojiEnabled === "boolean" ? value.gitmojiEnabled : undefined,
    defaultFileViewerPreview:
      typeof value.defaultFileViewerPreview === "boolean" ? value.defaultFileViewerPreview : undefined,
    zenModel: optionalString(value.zenModel),
  }
}

export async function loadConfigDefaults(): Promise<ConfigDefaults> {
  const runtimeSettings = getRegisteredRuntimeAPIs()?.settings
  if (runtimeSettings) {
    try {
      const result = await runtimeSettings.load()
      if (result?.settings) return parseConfigDefaults(result.settings)
    } catch {
      // The HTTP settings adapter remains available when native settings cannot be read.
    }
  }

  try {
    const response = await fetch(API_ENDPOINTS.config.settings, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return {}
    return parseConfigDefaults(await response.json())
  } catch (error) {
    console.warn("Failed to load Desktop settings defaults:", error)
    return {}
  }
}
