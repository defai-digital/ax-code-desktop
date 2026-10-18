import { isTauriShell } from "@/lib/desktop"
import { isLoopbackHostname } from "@/lib/loopback"
import { isRecord } from "@/lib/record"
import { getTauriGlobal } from "@/lib/tauriGlobal"
import type { TauriInvoke } from "@/lib/tauriGlobal"

type DesktopHost = {
  id: string
  label: string
  url: string
}

type DesktopHostsConfig = {
  hosts: DesktopHost[]
  defaultHostId: string | null
  initialHostChoiceCompleted: boolean
  localOrigin?: string | null
}

/** Backward-compatible input type — callers may omit `initialHostChoiceCompleted`. */
type DesktopHostsConfigInput = {
  hosts: DesktopHost[]
  defaultHostId: string | null
  initialHostChoiceCompleted?: boolean
}

type HostProbeStatus = "ok" | "auth" | "wrong-service" | "unreachable" | "incompatible" | "update-recommended"

type HostProbeResult = {
  status: HostProbeStatus
  latencyMs: number
}

const SENSITIVE_QUERY_KEY = /token|auth|secret|api/i

/** The query of a raw URL, for the comparisons `normalizeHostUrl` cannot make after stripping it. */
const searchOf = (raw: string): string => {
  try {
    return new URL(raw.trim()).search
  } catch {
    return ""
  }
}

export const normalizeHostUrl = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

export const redactSensitiveUrl = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return raw
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return raw
    }
    // Redact embedded credentials (userinfo) to prevent leaking user:pass
    if (url.username || url.password) {
      url.username = ""
      url.password = ""
    }

    const keys = Array.from(new Set(url.searchParams.keys()))
    for (const key of keys) {
      if (SENSITIVE_QUERY_KEY.test(key)) {
        url.searchParams.set(key, "[REDACTED]")
      }
    }
    return url.toString()
  } catch {
    return raw
  }
}

export const locationMatchesHost = (locationHref: string, hostUrl: string): boolean => {
  const normalizedCurrent = normalizeHostUrl(locationHref)
  const normalizedHost = normalizeHostUrl(hostUrl)
  if (!normalizedCurrent || !normalizedHost) {
    return false
  }

  try {
    const current = new URL(normalizedCurrent)
    const host = new URL(normalizedHost)
    if (current.origin !== host.origin) {
      // The local server answers as localhost, 127.0.0.1 and [::1]; a window opened under
      // one of those names is still the configured local host (dev uses 127.0.0.1 while the
      // stored local origin is localhost, which otherwise never matched).
      const sameLoopbackService =
        isLoopbackHostname(current.hostname) && isLoopbackHostname(host.hostname) && current.port === host.port
      if (!sameLoopbackService) {
        return false
      }
    }

    // Read the query from the raw values: `normalizeHostUrl` strips it, so this compared an
    // empty string against an empty string and a host configured for one query matched any
    // other query on the same origin — the first entry in the list won.
    const hostSearch = searchOf(hostUrl)
    if (hostSearch && searchOf(locationHref) !== hostSearch) {
      return false
    }

    const hostPath = host.pathname.length > 1 ? host.pathname.replace(/\/+$/, "") : host.pathname
    const currentPath = current.pathname.length > 1 ? current.pathname.replace(/\/+$/, "") : current.pathname
    if (hostPath === "/") {
      return true
    }
    return currentPath === hostPath || currentPath.startsWith(`${hostPath}/`)
  } catch {
    return false
  }
}

const readString = (obj: Record<string, unknown>, key: string): string | null => {
  const val = obj[key]
  return typeof val === "string" ? val : null
}

const readNumber = (obj: Record<string, unknown>, key: string): number | null => {
  const val = obj[key]
  return typeof val === "number" && Number.isFinite(val) ? val : null
}

const readHostProbeStatus = (value: unknown): HostProbeStatus => {
  if (
    value === "ok" ||
    value === "auth" ||
    value === "wrong-service" ||
    value === "unreachable" ||
    value === "incompatible" ||
    value === "update-recommended"
  ) {
    return value
  }
  return "unreachable"
}

export const isBlockingHostProbeStatus = (status: HostProbeStatus | null | undefined): boolean => {
  return (
    status === "wrong-service" ||
    status === "unreachable" ||
    status === "incompatible" ||
    status === "update-recommended"
  )
}

const parseHost = (value: unknown): DesktopHost | null => {
  if (!isRecord(value)) return null
  const id = readString(value, "id")
  const label = readString(value, "label")
  const url = readString(value, "url")
  if (!id || !label || !url) return null
  return { id, label, url }
}

const getInvoke = (): TauriInvoke | null => {
  if (!isTauriShell()) return null
  const tauri = getTauriGlobal()
  return typeof tauri?.core?.invoke === "function" ? tauri.core.invoke : null
}

export const desktopHostsGet = async (): Promise<DesktopHostsConfig> => {
  const invoke = getInvoke()
  if (!invoke) {
    return { hosts: [], defaultHostId: "local", initialHostChoiceCompleted: false, localOrigin: null }
  }

  const raw = await invoke("desktop_hosts_get")
  if (!isRecord(raw)) {
    return { hosts: [], defaultHostId: null, initialHostChoiceCompleted: false, localOrigin: null }
  }

  const hostsRaw = raw.hosts
  const hosts = Array.isArray(hostsRaw) ? hostsRaw.map(parseHost).filter((h): h is DesktopHost => Boolean(h)) : []

  const defaultHostId =
    readString(raw, "defaultHostId") || readString(raw, "default_host_id") || readString(raw, "defaultHostID")

  const initialHostChoiceCompleted =
    raw.initialHostChoiceCompleted === true || raw.initial_host_choice_completed === true

  const localOrigin = readString(raw, "localOrigin") || readString(raw, "local_origin")
  if (typeof window !== "undefined" && localOrigin) {
    // Electron's preload may expose this as a read-only contextBridge property, where assignment throws — the
    // same guard `persistence.ts` applies to `__AX_CODE_DESKTOP_HOME__`. Unguarded, the throw rejected this
    // whole read and the caller lost the hosts config the invoke had just returned.
    try {
      window.__AX_CODE_DESKTOP_LOCAL_ORIGIN__ = localOrigin
    } catch {
      /* read-only contextBridge property — the preload value stands */
    }
  }

  return { hosts, defaultHostId, initialHostChoiceCompleted, localOrigin }
}

export const desktopHostsSet = async (config: DesktopHostsConfigInput): Promise<void> => {
  const invoke = getInvoke()
  if (!invoke) return
  await invoke("desktop_hosts_set", {
    input: {
      hosts: config.hosts,
      defaultHostId: config.defaultHostId,
      initialHostChoiceCompleted: config.initialHostChoiceCompleted,
    },
  })
}

export const desktopHostProbe = async (url: string): Promise<HostProbeResult> => {
  const invoke = getInvoke()
  if (!invoke) {
    return { status: "unreachable", latencyMs: 0 }
  }

  const raw = await invoke("desktop_host_probe", { url })
  if (!isRecord(raw)) {
    return { status: "unreachable", latencyMs: 0 }
  }

  const status = readHostProbeStatus(raw.status)
  const latencyMs = readNumber(raw, "latencyMs") ?? readNumber(raw, "latency_ms") ?? 0
  return { status, latencyMs }
}
