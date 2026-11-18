import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry"
import type { SkillCatalogConfig } from "@/lib/desktop"
import { isPlainRecord } from "@/lib/record"
import { API_ENDPOINTS } from "@/lib/http"

interface CatalogSettings {
  skillCatalogs?: SkillCatalogConfig[]
}

const isCatalog = (value: unknown): value is SkillCatalogConfig => {
  if (!isPlainRecord(value)) return false
  return (
    [value.id, value.label, value.source].every((field) => typeof field === "string" && field.trim().length > 0) &&
    (value.subpath === undefined || typeof value.subpath === "string") &&
    (value.gitIdentityId === undefined || typeof value.gitIdentityId === "string")
  )
}

const parseSettings = (value: unknown): CatalogSettings | null => {
  if (!isPlainRecord(value)) return null
  if (value.skillCatalogs === undefined) return {}
  // These reads authorize whole-list writes. Dropping malformed entries would silently
  // remove them on the next save, so refuse the entire read instead.
  if (!Array.isArray(value.skillCatalogs) || !value.skillCatalogs.every(isCatalog)) return null
  return { skillCatalogs: value.skillCatalogs }
}

export const loadCatalogSettings = async (): Promise<CatalogSettings | null> => {
  try {
    const runtimeSettings = getRegisteredRuntimeAPIs()?.settings
    if (runtimeSettings) {
      const result = await runtimeSettings.load()
      return parseSettings(result?.settings)
    }

    const response = await fetch(API_ENDPOINTS.config.settings, {
      method: "GET",
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      return null
    }

    return parseSettings(await response.json().catch(() => null))
  } catch {
    return null
  }
}
