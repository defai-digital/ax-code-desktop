import { getProjectPathIdentityKey, normalizeProjectPath } from "@/lib/projectResolution"

export type SessionGridLayout = 1 | 2 | 3 | 4
export type GridEdge = "left" | "right" | "top" | "bottom"
export type GridDropTarget = GridEdge | "center"
export interface SessionGridSlot {
  sessionId: string
  directory: string
  /** The session's chat and browser page live in a popped-out window, so this pane must not mount them. */
  poppedOut?: boolean
}
export interface SessionGridState {
  layout: SessionGridLayout
  slots: (SessionGridSlot | null)[]
  ratios: { columns: number; rows: number }
  /** Null or omitted uses the preset geometry for `layout`. A tree is a free arrangement of the same slots. */
  tree?: GridNode | null
}
export type GridNode = GridLeaf | GridSplit
export interface GridLeaf {
  kind: "leaf"
  slot: number
}
export interface GridSplit {
  kind: "split"
  id: string
  axis: "column" | "row"
  ratio: number
  first: GridNode
  second: GridNode
}
export interface PlacedPane {
  slot: number
  left: number
  top: number
  width: number
  height: number
}
export interface PlacedSplitter {
  id: string
  axis: "column" | "row"
  ratio: number
  left: number
  top: number
  width: number
  height: number
  extent: number
}
export const GRID_MIN_WIDTH = 320
export const GRID_GAP = 6
export const GRID_MAX_SLOTS = 4
const EDGE_FRACTION = 0.25
const SPLIT_ID = /^s\d+$/
export const emptySessionGrid = (): SessionGridState => ({
  layout: 1,
  slots: [null],
  ratios: { columns: 0.5, rows: 0.5 },
  tree: null,
})
export const normalizeGridRatio = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5
const ratio = normalizeGridRatio

const sameDirectory = (left: string, right: string) =>
  getProjectPathIdentityKey(left) === getProjectPathIdentityKey(right)

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
    return slot.poppedOut === true
      ? { sessionId: slot.sessionId, directory, poppedOut: true as const }
      : { sessionId: slot.sessionId, directory }
  })
  return {
    layout,
    slots,
    ratios: { columns: ratio(data.ratios?.columns), rows: ratio(data.ratios?.rows) },
    tree: restoreTree(data.tree, layout),
  }
}

function restoreTree(value: unknown, layout: number): GridNode | null {
  const seen = new Set<number>()
  const ids = new Set<string>()
  const parse = (node: unknown): GridNode | null => {
    if (!node || typeof node !== "object") return null
    const record = node as {
      kind?: string
      slot?: number
      id?: string
      axis?: string
      ratio?: unknown
      first?: unknown
      second?: unknown
    }
    if (record.kind === "leaf") {
      if (!Number.isInteger(record.slot) || (record.slot ?? -1) < 0 || (record.slot ?? 0) >= layout || seen.has(record.slot!))
        return null
      seen.add(record.slot!)
      return { kind: "leaf", slot: record.slot! }
    }
    if (record.kind !== "split" || (record.axis !== "column" && record.axis !== "row")) return null
    if (typeof record.id !== "string" || !SPLIT_ID.test(record.id) || ids.has(record.id)) return null
    ids.add(record.id)
    const first = parse(record.first)
    const second = parse(record.second)
    if (!first || !second) return null
    return { kind: "split", id: record.id, axis: record.axis, ratio: ratio(record.ratio), first, second }
  }
  const tree = parse(value)
  if (!tree || seen.size !== layout || ids.size !== layout - 1) return null
  return tree
}

/** Missing sessions remain saved so a delayed portfolio load can resolve them. */
export function resolveGridSession<T extends { sessionId: string; directory: string | null }>(
  slot: SessionGridSlot | null,
  rows: readonly T[],
): T | null {
  return slot
    ? (rows.find(
        (row) => row.sessionId === slot.sessionId && sameDirectory(row.directory ?? "", slot.directory),
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

/**
 * Slots for a new layout. Sessions keep their order and fill the remaining panes first, so shrinking only drops a session
 * when there are more sessions than panes.
 */
export function resizeGridSlots(
  slots: readonly (SessionGridSlot | null)[],
  layout: SessionGridLayout,
): (SessionGridSlot | null)[] {
  if (slots.length <= layout) return Array.from({ length: layout }, (_, i) => slots[i] ?? null)
  const sessions = slots.filter((slot): slot is SessionGridSlot => slot !== null)
  return Array.from({ length: layout }, (_, i) => sessions[i] ?? null)
}

const leaf = (slot: number): GridLeaf => ({ kind: "leaf", slot })

/** The preset binary tree. Layout 4 shares one column ratio across both rows, matching the aligned preset geometry. */
export function presetTree(layout: SessionGridLayout, ratios: SessionGridState["ratios"]): GridNode {
  if (layout === 1) return leaf(0)
  if (layout === 2)
    return { kind: "split", id: "s1", axis: "column", ratio: ratios.columns, first: leaf(0), second: leaf(1) }
  if (layout === 3)
    return {
      kind: "split",
      id: "s1",
      axis: "column",
      ratio: ratios.columns,
      first: leaf(0),
      second: { kind: "split", id: "s2", axis: "row", ratio: ratios.rows, first: leaf(1), second: leaf(2) },
    }
  return {
    kind: "split",
    id: "s1",
    axis: "row",
    ratio: ratios.rows,
    first: { kind: "split", id: "s2", axis: "column", ratio: ratios.columns, first: leaf(0), second: leaf(1) },
    second: { kind: "split", id: "s3", axis: "column", ratio: ratios.columns, first: leaf(2), second: leaf(3) },
  }
}

function minimumExtent(node: GridNode, axis: "column" | "row"): number {
  if (node.kind === "leaf") return 160
  if (node.axis !== axis) return Math.max(minimumExtent(node.first, axis), minimumExtent(node.second, axis))
  return minimumExtent(node.first, axis) + minimumExtent(node.second, axis) + GRID_GAP
}

/** Lay out a free arrangement. Each split keeps its own ratio and never makes a pane smaller than 160px. */
export function layoutGridTree(tree: GridNode, width: number, height: number) {
  const w = Math.max(minimumExtent(tree, "column"), width)
  const h = Math.max(minimumExtent(tree, "row"), height)
  const panes: PlacedPane[] = []
  const splitters: PlacedSplitter[] = []
  const visit = (node: GridNode, x: number, y: number, nodeWidth: number, nodeHeight: number) => {
    if (node.kind === "leaf") {
      panes[node.slot] = { slot: node.slot, left: x, top: y, width: nodeWidth, height: nodeHeight }
      return
    }
    const extent = node.axis === "column" ? nodeWidth : nodeHeight
    const splitRatio = clampGridRatio(node.ratio, extent, 160)
    const firstSize = (extent - GRID_GAP) * splitRatio
    const secondSize = extent - GRID_GAP - firstSize
    if (node.axis === "column") {
      visit(node.first, x, y, firstSize, nodeHeight)
      visit(node.second, x + firstSize + GRID_GAP, y, secondSize, nodeHeight)
      splitters.push({
        id: node.id,
        axis: "column",
        ratio: splitRatio,
        left: x + firstSize,
        top: y,
        width: GRID_GAP,
        height: nodeHeight,
        extent: nodeWidth,
      })
      return
    }
    visit(node.first, x, y, nodeWidth, firstSize)
    visit(node.second, x, y + firstSize + GRID_GAP, nodeWidth, secondSize)
    splitters.push({
      id: node.id,
      axis: "row",
      ratio: splitRatio,
      left: x,
      top: y + firstSize,
      width: nodeWidth,
      height: GRID_GAP,
      extent: nodeHeight,
    })
  }
  visit(tree, 0, 0, w, h)
  return { width: w, height: h, panes, splitters }
}

/** Which edge of a pane a pointer is on. The center reorders; a band within 25% of an edge splits. */
export function gridDropEdge(x: number, y: number, width: number, height: number): GridDropTarget {
  if (!(width > 0) || !(height > 0)) return "center"
  const distances: Array<[GridEdge, number]> = [
    ["left", x / width],
    ["right", (width - x) / width],
    ["top", y / height],
    ["bottom", (height - y) / height],
  ]
  let best = distances[0]
  for (const entry of distances) if (entry[1] < best[1]) best = entry
  return best[1] <= EDGE_FRACTION ? best[0] : "center"
}

/** The nearest pane that shares an edge in `direction`, or null when the pane is already on that side. */
export function gridNeighbor(panes: readonly PlacedPane[], slot: number, direction: GridEdge): number | null {
  const source = panes.find((pane) => pane && pane.slot === slot)
  if (!source) return null
  let best: { slot: number; gap: number; overlap: number; start: number } | null = null
  for (const pane of panes) {
    if (!pane || pane.slot === slot) continue
    const horizontal = direction === "left" || direction === "right"
    const gap = horizontal
      ? direction === "left"
        ? source.left - (pane.left + pane.width)
        : pane.left - (source.left + source.width)
      : direction === "top"
        ? source.top - (pane.top + pane.height)
        : pane.top - (source.top + source.height)
    const overlap = horizontal
      ? Math.min(source.top + source.height, pane.top + pane.height) - Math.max(source.top, pane.top)
      : Math.min(source.left + source.width, pane.left + pane.width) - Math.max(source.left, pane.left)
    if (gap < -1 || overlap <= 0) continue
    const start = horizontal ? pane.top : pane.left
    const nearer =
      !best ||
      gap < best.gap - 1e-6 ||
      (Math.abs(gap - best.gap) <= 1e-6 && (overlap > best.overlap + 1e-6 || (Math.abs(overlap - best.overlap) <= 1e-6 && start < best.start)))
    if (nearer) best = { slot: pane.slot, gap, overlap, start }
  }
  return best?.slot ?? null
}

/** Swap two slots. The panes stay where they are; the sessions trade places. */
export function reorderGridSlots(
  slots: readonly (SessionGridSlot | null)[],
  from: number,
  to: number,
): (SessionGridSlot | null)[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length)
    return slots.slice()
  const next = slots.slice()
  const held = next[from]
  next[from] = next[to]
  next[to] = held
  return next
}

function detachLeaf(node: GridNode, slot: number): GridNode | null {
  if (node.kind === "leaf") return node.slot === slot ? null : node
  const first = detachLeaf(node.first, slot)
  const second = detachLeaf(node.second, slot)
  if (!first) return second
  if (!second) return first
  if (first === node.first && second === node.second) return node
  return { ...node, first, second }
}

function wrapLeaf(node: GridNode, target: number, incoming: GridNode, edge: GridEdge, id: string): GridNode {
  if (node.kind === "leaf") {
    if (node.slot !== target) return node
    const axis = edge === "left" || edge === "right" ? "column" : "row"
    const incomingFirst = edge === "left" || edge === "top"
    return {
      kind: "split",
      id,
      axis,
      ratio: 0.5,
      first: incomingFirst ? incoming : node,
      second: incomingFirst ? node : incoming,
    }
  }
  return {
    ...node,
    first: wrapLeaf(node.first, target, incoming, edge, id),
    second: wrapLeaf(node.second, target, incoming, edge, id),
  }
}

function renumberSplits(node: GridNode, counter = { n: 0 }): GridNode {
  if (node.kind === "leaf") return node
  const id = `s${++counter.n}`
  return { ...node, id, first: renumberSplits(node.first, counter), second: renumberSplits(node.second, counter) }
}

function sameShape(left: GridNode, right: GridNode): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === "leaf" && right.kind === "leaf") return left.slot === right.slot
  if (left.kind === "split" && right.kind === "split")
    return left.axis === right.axis && sameShape(left.first, right.first) && sameShape(left.second, right.second)
  return false
}

/**
 * Move `from` onto an edge of `target`, collapsing the gap it leaves. The pane count does not change, so a grid that
 * is already at four sessions can still be rearranged.
 */
export function placeGridSlot(tree: GridNode, from: number, target: number, edge: GridEdge): GridNode | null {
  if (from === target) return null
  const detached = detachLeaf(tree, from)
  if (!detached) return null
  return renumberSplits(wrapLeaf(detached, target, leaf(from), edge, "s0"))
}

export function placedPanes(state: SessionGridState, width = 1000, height = 800): PlacedPane[] {
  if (state.tree) return layoutGridTree(state.tree, width, height).panes
  return sessionGridGeometry(state.layout, width, height, state.ratios).panes.map((pane, slot) => ({ slot, ...pane }))
}

/** Keyboard move: trade places with the pane in that direction. */
export function moveGridSlot(state: SessionGridState, index: number, direction: GridEdge): SessionGridState {
  const target = gridNeighbor(placedPanes(state), index, direction)
  if (target === null) return state
  return { ...state, slots: reorderGridSlots(state.slots, index, target) }
}

/**
 * Drop a dragged slot. The center swaps the two sessions. An edge docks the dragged pane on that side of the target.
 * Docking back into the preset shape clears the free arrangement so the preset ratios apply again.
 */
export function applyGridDrop(state: SessionGridState, from: number, target: number, edge: GridDropTarget): SessionGridState {
  if (from === target || from < 0 || target < 0 || from >= state.slots.length || target >= state.slots.length) return state
  if (edge === "center") return { ...state, slots: reorderGridSlots(state.slots, from, target) }
  const next = placeGridSlot(state.tree ?? presetTree(state.layout, state.ratios), from, target, edge)
  if (!next) return state
  if (!state.tree && sameShape(next, presetTree(state.layout, state.ratios))) return state
  return { ...state, tree: next }
}

/** Split menu: insert an empty pane on that edge. Four sessions is the limit, so a full grid cannot grow. */
export function splitGridPane(state: SessionGridState, index: number, edge: GridEdge): SessionGridState | null {
  if (state.slots.length >= GRID_MAX_SLOTS || index < 0 || index >= state.slots.length) return null
  const layout = (state.slots.length + 1) as SessionGridLayout
  const tree = renumberSplits(
    wrapLeaf(state.tree ?? presetTree(state.layout, state.ratios), index, leaf(state.slots.length), edge, "s0"),
  )
  return { ...state, layout, slots: [...state.slots, null], tree }
}

export function updateSplitRatio(tree: GridNode, id: string, value: number): GridNode {
  if (tree.kind === "leaf") return tree
  return {
    ...tree,
    ratio: tree.id === id ? ratio(value) : tree.ratio,
    first: updateSplitRatio(tree.first, id, value),
    second: updateSplitRatio(tree.second, id, value),
  }
}

export function markSlotPopped(
  slots: readonly (SessionGridSlot | null)[],
  sessionId: string,
  directory: string,
  popped: boolean,
): (SessionGridSlot | null)[] {
  let changed = false
  const next = slots.map((slot) => {
    if (!slot || slot.sessionId !== sessionId || !sameDirectory(slot.directory, directory) || Boolean(slot.poppedOut) === popped)
      return slot
    changed = true
    return popped
      ? { sessionId: slot.sessionId, directory: slot.directory, poppedOut: true as const }
      : { sessionId: slot.sessionId, directory: slot.directory }
  })
  return changed ? next : (slots as (SessionGridSlot | null)[])
}
