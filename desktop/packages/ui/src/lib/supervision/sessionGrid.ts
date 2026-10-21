import { getProjectPathIdentityKey, normalizeProjectPath } from "@/lib/projectResolution"

export type SessionGridLayout = 1 | 2 | 3 | 4
export interface SessionGridSlot {
  sessionId: string
  directory: string
}
export interface SessionGridState {
  layout: SessionGridLayout
  slots: (SessionGridSlot | null)[]
  ratios: { columns: number; rows: number }
}
export const GRID_MIN_WIDTH = 320
export const GRID_GAP = 6
export const emptySessionGrid = (): SessionGridState => ({
  layout: 1,
  slots: [null],
  ratios: { columns: 0.5, rows: 0.5 },
})
const ratio = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5

/** Validate untrusted persistence without importing a store or requiring loaded sessions. */
export function restoreSessionGrid(value: unknown): SessionGridState {
  if (!value || typeof value !== "object") return emptySessionGrid()
  const data = value as Partial<SessionGridState>
  const layout = ([1, 2, 3, 4].includes(data.layout as number) ? data.layout : 1) as SessionGridLayout
  const seen = new Set<string>()
  const slots = Array.from({ length: layout }, (_, i) => {
    const slot = Array.isArray(data.slots) ? data.slots[i] : null
    if (
      !slot ||
      typeof slot.sessionId !== "string" ||
      !slot.sessionId.trim() ||
      slot.sessionId.length > 512 ||
      typeof slot.directory !== "string" ||
      slot.directory.length > 4096
    )
      return null
    const directory = normalizeProjectPath(slot.directory)
    const key = `${slot.sessionId}:${getProjectPathIdentityKey(directory)}`
    if (!directory || seen.has(key)) return null
    seen.add(key)
    return { sessionId: slot.sessionId, directory }
  })
  return { layout, slots, ratios: { columns: ratio(data.ratios?.columns), rows: ratio(data.ratios?.rows) } }
}

/** Missing sessions remain saved so a delayed portfolio load can resolve them. */
export function resolveGridSession<T extends { sessionId: string; directory: string | null }>(
  slot: SessionGridSlot | null,
  rows: readonly T[],
): T | null {
  return slot
    ? (rows.find(
        (row) =>
          row.sessionId === slot.sessionId &&
          getProjectPathIdentityKey(row.directory) === getProjectPathIdentityKey(slot.directory),
      ) ?? null)
    : null
}

export function clampGridRatio(value: number, extent: number, minimum = GRID_MIN_WIDTH): number {
  const available = Math.max(minimum * 2, extent - GRID_GAP)
  const lower = minimum / available
  return Math.max(lower, Math.min(1 - lower, ratio(value)))
}

export function sessionGridGeometry(
  layout: SessionGridLayout,
  width: number,
  height: number,
  ratios: SessionGridState["ratios"],
) {
  // A pane keeps GRID_MIN_WIDTH when the window allows it; in a narrow window the panes share the visible width instead
  // of being pushed off-screen, never below half of the minimum.
  const minimum = layout === 1 ? GRID_MIN_WIDTH : Math.max(GRID_MIN_WIDTH / 2, Math.min(GRID_MIN_WIDTH, (width - GRID_GAP) / 2))
  const w = Math.max(layout === 1 ? GRID_MIN_WIDTH / 2 : minimum * 2 + GRID_GAP, width)
  const h = Math.max(layout >= 3 ? 326 : 160, height)
  const columns = clampGridRatio(ratios.columns, w, minimum)
  const rows = clampGridRatio(ratios.rows, h, 160)
  const left = (w - GRID_GAP) * columns
  const top = (h - GRID_GAP) * rows
  const right = w - GRID_GAP - left
  const bottom = h - GRID_GAP - top
  const rect = (x: number, y: number, width: number, height: number) => ({ left: x, top: y, width, height })
  const panes =
    layout === 1
      ? [rect(0, 0, w, h)]
      : layout === 2
        ? [rect(0, 0, left, h), rect(left + GRID_GAP, 0, right, h)]
        : layout === 3
          ? [
              rect(0, 0, left, h),
              rect(left + GRID_GAP, 0, right, top),
              rect(left + GRID_GAP, top + GRID_GAP, right, bottom),
            ]
          : [
              rect(0, 0, left, top),
              rect(left + GRID_GAP, 0, right, top),
              rect(0, top + GRID_GAP, left, bottom),
              rect(left + GRID_GAP, top + GRID_GAP, right, bottom),
            ]
  return {
    width: w,
    height: h,
    columns,
    rows,
    panes,
    columnSplitter: rect(left, 0, GRID_GAP, h),
    rowSplitter: rect(layout === 3 ? left + GRID_GAP : 0, top, layout === 3 ? right : w, GRID_GAP),
  }
}
