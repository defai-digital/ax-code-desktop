import { getSafeStorage } from "@/stores/utils/safeStorage"
import { normalizeGridRatio, type SessionGridLayout, type SessionGridState } from "./sessionGrid"

/** Per-layout preset split sizes. Custom trees keep their ratios on the grid snapshot instead. */
export const SESSION_GRID_RATIOS_KEY = "openchamber.session-grid-ratios.v1"

type RatioMap = Partial<Record<SessionGridLayout, SessionGridState["ratios"]>>

const readMap = (storage: Storage): RatioMap => {
  try {
    const raw = storage.getItem(SESSION_GRID_RATIOS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const map: RatioMap = {}
    for (const layout of [1, 2, 3, 4] as const) {
      const entry = (parsed as Record<string, unknown>)[String(layout)]
      if (!entry || typeof entry !== "object") continue
      const record = entry as { columns?: unknown; rows?: unknown }
      map[layout] = { columns: normalizeGridRatio(record.columns), rows: normalizeGridRatio(record.rows) }
    }
    return map
  } catch {
    return {}
  }
}

/** The saved preset split for `layout`, or null when this layout has never been resized. */
export function ratiosForLayout(
  layout: SessionGridLayout,
  storage: Storage = getSafeStorage(),
): SessionGridState["ratios"] | null {
  try {
    return readMap(storage)[layout] ?? null
  } catch {
    return null
  }
}

/** Remember one preset layout. A throwing store is ignored so resizing the grid cannot fail the render. */
export function rememberLayoutRatios(
  layout: SessionGridLayout,
  ratios: SessionGridState["ratios"],
  storage: Storage = getSafeStorage(),
): void {
  try {
    const map = readMap(storage)
    map[layout] = { columns: normalizeGridRatio(ratios.columns), rows: normalizeGridRatio(ratios.rows) }
    storage.setItem(SESSION_GRID_RATIOS_KEY, JSON.stringify(map))
  } catch {
    // Preferences are best-effort. A full or blocked store must not break the grid.
  }
}
