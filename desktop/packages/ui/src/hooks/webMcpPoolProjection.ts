/**
 * Pure decisions for the window-level WebMCP pool poll.
 * The hook keeps the in-flight command guard and the disappeared-view reset; this module only
 * decides whether a native row would change the stored view, and whether its catalog bytes
 * have to be normalized.
 */

export type PoolProjectionCurrent = {
  phase: string
  busy?: boolean
  browserId: string | null
  directory: string | null
  sessionID: string | null
  nativeAvailable: boolean
  runtimeCompatible: boolean | null
  enabled: boolean
  paused: boolean
  visible: boolean
  waiting: boolean
  interrupted?: boolean
  unloaded?: boolean
  idle?: boolean
  origin: string | null
  page?: string | null
  tools: number
  generation: string | null
  error: string | null
  pausedBridgeServers?: readonly string[]
}

export type PoolProjectionNative = {
  id: string
  directory: string | null
  sessionID: string | null
  nativeAvailable: boolean
  enabled: boolean
  interrupted?: boolean
  origin: string | null
  paused: boolean
  visible: boolean
  waiting: boolean
  tools: number
  page?: string | null
  error?: string | null
  unloaded?: boolean
  idle?: boolean
  generation?: unknown
  catalog?: unknown
  catalogTotal?: unknown
  catalogTruncation?: unknown
  catalogRejection?: unknown
}

export type PoolCapacity = {
  liveViews: number
  maxLiveViews: number
  otherWindows?: { id: string; pageCount: number }[]
}

export const nativeGeneration = (generation: unknown): string | null =>
  typeof generation === "string" ? generation : null

/** Preserve an in-flight command failure when the browser has no newer error to report. */
export const projectedNativeError = <T extends string>(
  nativeError: T | null | undefined,
  currentError: string | null | undefined,
): T | "operation-failed" | null => nativeError ?? (currentError === "operation-failed" ? currentError : null)

/**
 * Fingerprint of the raw catalog payload. Undefined when the payload cannot be serialized;
 * callers treat that as "must normalize" so a cyclic catalog is never dropped.
 */
export function nativeCatalogKey(
  native: Pick<PoolProjectionNative, "catalog" | "catalogTotal" | "catalogTruncation" | "catalogRejection">,
): string | undefined {
  try {
    return JSON.stringify([
      native.catalog ?? null,
      native.catalogTotal ?? null,
      native.catalogTruncation ?? null,
      native.catalogRejection ?? null,
    ])
  } catch {
    return undefined
  }
}

const sameStrings = (left: readonly string[] | undefined, right: readonly string[]) =>
  !!left && left.length === right.length && left.every((entry, index) => entry === right[index])

const sameWindows = (
  left: { id: string; pageCount: number }[] | undefined,
  right: { id: string; pageCount: number }[] | undefined,
) => {
  if (left === right) return true
  if (!left || !right) return !left && !right
  return (
    left.length === right.length &&
    left.every((entry, index) => entry.id === right[index]?.id && entry.pageCount === right[index]?.pageCount)
  )
}

export function samePoolCapacity(current: PoolCapacity | null | undefined, next: PoolCapacity): boolean {
  return (
    !!current &&
    current.liveViews === next.liveViews &&
    current.maxLiveViews === next.maxLiveViews &&
    sameWindows(current.otherWindows, next.otherWindows)
  )
}

/**
 * Whether this native row should be written, and whether `readWebMcpCatalog` has to run.
 * Catalog bytes are normalized for a new view, a generation change, or a changed raw payload.
 * Generation alone is not enough: adding a tool does not rotate the document generation unless
 * a previous definition was retired, and a rejection can change on the same generation.
 */
export function shouldApplyNativeView(
  current: PoolProjectionCurrent | undefined,
  native: PoolProjectionNative,
  pausedBridgeServers: readonly string[],
  previousCatalogKey: string | undefined,
  catalogKey: string | undefined,
): { apply: boolean; normalizeCatalog: boolean } {
  if (!current) return { apply: true, normalizeCatalog: true }
  if (current.busy || current.phase === "starting") return { apply: false, normalizeCatalog: false }
  const generation = nativeGeneration(native.generation)
  const generationChanged = current.generation !== generation
  const catalogChanged = catalogKey === undefined || previousCatalogKey !== catalogKey
  const normalizeCatalog = generationChanged || catalogChanged
  const structuralChanged =
    current.phase !== "ready" ||
    current.browserId !== native.id ||
    current.directory !== native.directory ||
    current.sessionID !== native.sessionID ||
    (native.enabled && current.runtimeCompatible !== true)
  const scalarsChanged =
    current.enabled !== native.enabled ||
    current.paused !== native.paused ||
    current.visible !== native.visible ||
    current.waiting !== native.waiting ||
    (current.interrupted ?? false) !== (native.interrupted ?? false) ||
    current.origin !== native.origin ||
    !Object.is(current.page, native.page) ||
    current.tools !== native.tools ||
    current.nativeAvailable !== native.nativeAvailable ||
    (current.unloaded ?? false) !== (native.unloaded ?? false) ||
    (current.idle ?? false) !== (native.idle ?? false) ||
    current.error !== projectedNativeError(native.error, current.error) ||
    !sameStrings(current.pausedBridgeServers, pausedBridgeServers)
  return { apply: structuralChanged || scalarsChanged || normalizeCatalog, normalizeCatalog }
}
