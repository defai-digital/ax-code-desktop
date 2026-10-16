import { API_ENDPOINTS } from "@/lib/http"

/**
 * The standalone AX Code CLI/TUI the user installed on their own (curl
 * installer or Homebrew), as reported by `GET /api/ax-code/cli/status`.
 * Desktop's own runtime is separate and is updated with the app.
 */
export type AxCodeCliMethod = "curl" | "brew" | "unknown"

export type AxCodeCliUpgradeState = "running" | "succeeded" | "failed"

export interface AxCodeCliUpgradeJob {
  readonly state: AxCodeCliUpgradeState
  readonly path?: string | null
  readonly fromVersion?: string | null
  readonly targetVersion?: string | null
  readonly previousVersion?: string | null
  readonly version?: string | null
  readonly reason?: string | null
  readonly shadowedBy?: { readonly path: string | null; readonly version: string | null } | null
  readonly runtimeRestarted?: boolean
  /** Upgraded, but Desktop's runtime (this CLI) did not come back on it. */
  readonly runtimeRestartFailed?: boolean
  readonly startedAt?: string | null
  readonly finishedAt?: string | null
}

export interface AxCodeCliStatus {
  readonly installed: boolean
  readonly path: string | null
  readonly onPath: boolean
  readonly otherPaths: readonly string[]
  readonly isRuntimeBinary: boolean
  /** How Desktop resolved its own runtime (`bundled`, `settings`, `env`, `path`). */
  readonly runtimeSource: string | null
  readonly currentVersion: string | null
  readonly latestVersion: string | null
  readonly updateAvailable: boolean | null
  readonly method: AxCodeCliMethod
  readonly checkSupported: boolean | null
  readonly canUpgrade: boolean
  readonly manualCommand: string | null
  /** Why a known install still gets no one-click update. */
  readonly blockedReason: "unknown-method" | "runtime-in-use" | null
  readonly error: string | null
  readonly checkedAt: string | null
  readonly upgrade: AxCodeCliUpgradeJob | null
}

export interface AxCodeCliUpgradeStart {
  readonly accepted: boolean
  readonly reason?: string
  readonly upgrade?: AxCodeCliUpgradeJob | null
  readonly cli?: AxCodeCliStatus | null
}

const asString = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

const parseJob = (value: unknown): AxCodeCliUpgradeJob | null => {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const state = raw.state
  if (state !== "running" && state !== "succeeded" && state !== "failed") return null
  const shadow =
    raw.shadowedBy && typeof raw.shadowedBy === "object" ? (raw.shadowedBy as Record<string, unknown>) : null
  return {
    state,
    path: asString(raw.path),
    fromVersion: asString(raw.fromVersion),
    targetVersion: asString(raw.targetVersion),
    previousVersion: asString(raw.previousVersion),
    version: asString(raw.version),
    reason: asString(raw.reason),
    shadowedBy: shadow ? { path: asString(shadow.path), version: asString(shadow.version) } : null,
    runtimeRestarted: raw.runtimeRestarted === true,
    runtimeRestartFailed: raw.runtimeRestartFailed === true,
    startedAt: asString(raw.startedAt),
    finishedAt: asString(raw.finishedAt),
  }
}

/** Normalizes the status payload; returns null when it is not one. */
export const parseAxCodeCliStatus = (value: unknown): AxCodeCliStatus | null => {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (typeof raw.installed !== "boolean") return null
  const method = raw.method === "curl" || raw.method === "brew" ? raw.method : "unknown"
  return {
    installed: raw.installed,
    path: asString(raw.path),
    onPath: raw.onPath === true,
    otherPaths: Array.isArray(raw.otherPaths)
      ? raw.otherPaths.filter((entry): entry is string => typeof entry === "string")
      : [],
    isRuntimeBinary: raw.isRuntimeBinary === true,
    runtimeSource: asString(raw.runtimeSource),
    currentVersion: asString(raw.currentVersion),
    latestVersion: asString(raw.latestVersion),
    updateAvailable: typeof raw.updateAvailable === "boolean" ? raw.updateAvailable : null,
    method,
    checkSupported: typeof raw.checkSupported === "boolean" ? raw.checkSupported : null,
    canUpgrade: raw.canUpgrade === true,
    manualCommand: asString(raw.manualCommand),
    blockedReason:
      raw.blockedReason === "unknown-method" || raw.blockedReason === "runtime-in-use" ? raw.blockedReason : null,
    error: asString(raw.error),
    checkedAt: asString(raw.checkedAt),
    upgrade: parseJob(raw.upgrade),
  }
}

const postCheck = (refresh: boolean, signal?: AbortSignal) =>
  fetch(API_ENDPOINTS.axCode.cliCheck, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh }),
    ...(signal ? { signal } : {}),
  })

/**
 * Reads the status. The GET only serves the server's last check, so before
 * the first check this asks for one (a POST). `check` applies the server cache
 * policy; `refresh` forces a new check. Polling omits both to preserve the job.
 */
export const fetchAxCodeCliStatus = async (
  options: { refresh?: boolean; check?: boolean; signal?: AbortSignal } = {},
): Promise<AxCodeCliStatus> => {
  let response =
    options.refresh || options.check
      ? await postCheck(options.refresh === true, options.signal)
      : await fetch(API_ENDPOINTS.axCode.cliStatus, {
          headers: { Accept: "application/json" },
          ...(options.signal ? { signal: options.signal } : {}),
        })
  let payload = await response.json().catch(() => null)
  if (!options.refresh && response.ok && payload && (payload as { checked?: unknown }).checked === false) {
    response = await postCheck(false, options.signal)
    payload = await response.json().catch(() => null)
  }
  const status = parseAxCodeCliStatus(payload)
  if (!response.ok || !status) throw new Error(response.statusText || "AX Code CLI status check failed")
  return status
}

export const startAxCodeCliUpgrade = async (): Promise<AxCodeCliUpgradeStart> => {
  const response = await fetch(API_ENDPOINTS.axCode.cliUpgrade, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({}),
  })
  const payload = (await response.json().catch(() => null)) as null | Record<string, unknown>
  return {
    accepted: payload?.accepted === true,
    reason: asString(payload?.reason) ?? (response.ok ? undefined : "upgrade-failed"),
    upgrade: parseJob(payload?.upgrade),
    cli: parseAxCodeCliStatus(payload?.cli),
  }
}

/**
 * The version a CLI update toast should announce, or "" for none. Only the
 * install the terminal actually runs (on PATH) is announced.
 */
export const resolveAxCodeCliUpdateVersion = (status: AxCodeCliStatus | null | undefined): string => {
  if (!status?.installed || !status.onPath || status.updateAvailable !== true) return ""
  if (status.upgrade?.state === "running") return ""
  return status.latestVersion ?? ""
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Polls the status until the running upgrade settles, for as long as the
 * server still reports it running. Gives up (null) only after the server has
 * been unreachable for `unreachableMs`. When the job vanishes (the server
 * restarted mid-upgrade), keeps polling briefly, then returns the status as
 * is so the caller can show what the CLI reports now.
 */
export const waitForAxCodeCliUpgrade = async (
  options: { intervalMs?: number; unreachableMs?: number; vanishedGraceMs?: number; isCancelled?: () => boolean } = {},
): Promise<AxCodeCliStatus | null> => {
  const intervalMs = options.intervalMs ?? 2_000
  const unreachableMs = options.unreachableMs ?? 3 * 60_000
  const vanishedGraceMs = options.vanishedGraceMs ?? 30_000
  let lastReached = Date.now()
  let vanishedSince: number | null = null
  for (;;) {
    if (options.isCancelled?.()) return null
    await sleep(intervalMs)
    if (options.isCancelled?.()) return null
    const controller = new AbortController()
    // A pending response (including its body) must not outlive the same
    // reachability budget that bounds repeated failed requests.
    const timeout = setTimeout(() => controller.abort(), Math.max(1, unreachableMs - (Date.now() - lastReached)))
    try {
      const status = await fetchAxCodeCliStatus({ signal: controller.signal })
      lastReached = Date.now()
      if (status.upgrade?.state === "running") {
        vanishedSince = null
        continue
      }
      if (status.upgrade) return status
      vanishedSince ??= Date.now()
      if (Date.now() - vanishedSince >= vanishedGraceMs) return status
    } catch {
      // The server restarts the runtime after some upgrades; keep polling.
      if (Date.now() - lastReached >= unreachableMs) return null
    } finally {
      clearTimeout(timeout)
    }
  }
}
