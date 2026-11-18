import { createPersistedFields, type PersistedFieldReader } from "./persistedFields"
import { isPlainRecord } from "./record"

export type PermissionAutoAcceptMap = Record<string, boolean>
export interface PermissionPreferences {
  autoAccept: PermissionAutoAcceptMap
  /** The new-chat choice is distinct from existing sessions' explicit settings. */
  defaultAutoAccept: boolean
}

const readLegacyBoolean: PersistedFieldReader<boolean> = (value, current) => {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  if (typeof value === "number" && Number.isFinite(value)) return value === 1
  // Malformed storage cannot turn a current opt-out into an opt-in.
  return current
}

const readAutoAccept: PersistedFieldReader<PermissionAutoAcceptMap> = (value, current) => {
  if (!isPlainRecord(value)) return current
  const entries = Object.entries(value)
  const restored = new Map<string, boolean>()
  for (const [key, enabled] of entries) {
    if (!key.includes("/")) restored.set(key, readLegacyBoolean(enabled, false))
  }
  for (const [key, enabled] of entries) {
    if (key.endsWith("/*") || !key.includes("/")) continue
    const trimmed = key.trim()
    if (!trimmed) continue
    const slash = trimmed.lastIndexOf("/")
    const sessionId = slash === -1 || slash === trimmed.length - 1 ? trimmed : trimmed.slice(slash + 1)
    if (!restored.has(sessionId)) restored.set(sessionId, readLegacyBoolean(enabled, false))
  }
  return Object.fromEntries(restored)
}

export const permissionPreferencePersistence = createPersistedFields<PermissionPreferences>({
  autoAccept: readAutoAccept,
  defaultAutoAccept: readLegacyBoolean,
})
