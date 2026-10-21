import { useSyncExternalStore } from "react"

/**
 * Review-rail directory grouping. Git paths use "/"; a Windows session diff may use "\\".
 * Both separate segments. The original path string is kept for selection and open.
 */

export const REVIEW_RAIL_MIN_WIDTH = 180
export const REVIEW_RAIL_DEFAULT_WIDTH = 240
export const REVIEW_RAIL_WIDTH_STEP = 16
export const REVIEW_RAIL_WIDTH_STORAGE_KEY = "ax-code-review-rail-width"
export const REVIEW_RAIL_MODE_STORAGE_KEY = "ax-code-review-rail-mode"

export type ReviewRailMode = "tree" | "list"

const SEPARATOR = /[/\\]/

export function splitReviewPath(path: string): { name: string; parent: string } {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (slash < 0) return { name: path, parent: "" }
  const name = path.slice(slash + 1)
  if (!name) return { name: path, parent: "" }
  return { name, parent: path.slice(0, slash) }
}

function directorySegments(parent: string): string[] {
  if (!parent) return []
  return parent.split(SEPARATOR).filter((segment) => segment.length > 0)
}

export type ReviewTreeFileNode = {
  kind: "file"
  path: string
  name: string
  level: number
  /** Id of the directory row that contains this file, after chain compression. */
  parentId: string | null
}

export type ReviewTreeDirNode = {
  kind: "dir"
  /** Logical directory id, segments joined with "/", including a compressed chain. */
  id: string
  /** Visible label. A single-child chain is one label, such as "a/b/c". */
  name: string
  level: number
  parentId: string | null
  filePaths: readonly string[]
  children: readonly ReviewTreeNode[]
}

export type ReviewTreeNode = ReviewTreeFileNode | ReviewTreeDirNode

export type ReviewFileTree = {
  nodes: readonly ReviewTreeNode[]
  /** Files in depth-first visual order. Collapsed directories are still listed. */
  paths: readonly string[]
  ancestors: ReadonlyMap<string, readonly string[]>
}

type MutableDir = {
  kind: "dir"
  segment: string
  id: string
  children: MutableNode[]
  dirs: Map<string, MutableDir>
}

type MutableFile = { kind: "file"; path: string; name: string }
type MutableNode = MutableDir | MutableFile

function compressDirectory(node: MutableDir): MutableDir {
  let current = node
  const names = [current.segment]
  while (current.children.length === 1 && current.children[0].kind === "dir") {
    current = current.children[0]
    names.push(current.segment)
  }
  if (current === node) return node
  return {
    kind: "dir",
    segment: names.join("/"),
    id: current.id,
    children: current.children,
    dirs: current.dirs,
  }
}

function freezeNodes(
  nodes: readonly MutableNode[],
  level: number,
  parentId: string | null,
  ancestorIds: readonly string[],
  ancestors: Map<string, readonly string[]>,
  paths: string[],
): ReviewTreeNode[] {
  const frozen: ReviewTreeNode[] = []
  for (const node of nodes) {
    if (node.kind === "file") {
      ancestors.set(node.path, ancestorIds)
      paths.push(node.path)
      frozen.push({ kind: "file", path: node.path, name: node.name, level, parentId })
      continue
    }
    const compressed = compressDirectory(node)
    const childAncestors = [...ancestorIds, compressed.id]
    const children = freezeNodes(compressed.children, level + 1, compressed.id, childAncestors, ancestors, paths)
    const filePaths: string[] = []
    collectFilePaths(children, filePaths)
    frozen.push({
      kind: "dir",
      id: compressed.id,
      name: compressed.segment,
      level,
      parentId,
      filePaths,
      children,
    })
  }
  return frozen
}

function collectFilePaths(nodes: readonly ReviewTreeNode[], into: string[]): void {
  for (const node of nodes) {
    if (node.kind === "file") into.push(node.path)
    else collectFilePaths(node.children, into)
  }
}

/** Group paths into a directory tree. A directory with only one directory child folds into that child. */
export function buildReviewFileTree(files: readonly { path: string }[]): ReviewFileTree {
  const root: MutableDir = { kind: "dir", segment: "", id: "", children: [], dirs: new Map() }
  for (const file of files) {
    const { name, parent } = splitReviewPath(file.path)
    let cursor = root
    for (const segment of directorySegments(parent)) {
      let next = cursor.dirs.get(segment)
      if (!next) {
        const id = cursor.id ? `${cursor.id}/${segment}` : segment
        next = { kind: "dir", segment, id, children: [], dirs: new Map() }
        cursor.dirs.set(segment, next)
        cursor.children.push(next)
      }
      cursor = next
    }
    cursor.children.push({ kind: "file", path: file.path, name })
  }
  const ancestors = new Map<string, readonly string[]>()
  const paths: string[] = []
  const nodes = freezeNodes(root.children, 1, null, [], ancestors, paths)
  return { nodes, paths, ancestors }
}

export function sameReviewPaths(left: readonly { path: string }[], right: readonly { path: string }[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].path !== right[index].path) return false
  }
  return true
}

/**
 * Tree mode walks the depth-first visual order. List mode keeps the caller's order.
 * Collapsed directories are not removed: next and previous still land on those files.
 */
export function orderReviewRailFiles<T extends { path: string }>(
  files: readonly T[],
  mode: ReviewRailMode = getReviewRailMode(),
): readonly T[] {
  if (mode === "list" || files.length < 2) return files
  const paths = buildReviewFileTree(files).paths
  if (paths.length === files.length) {
    let same = true
    for (let index = 0; index < files.length; index += 1) {
      if (files[index].path !== paths[index]) {
        same = false
        break
      }
    }
    if (same) return files
  }
  const buckets = new Map<string, T[]>()
  for (const file of files) {
    const list = buckets.get(file.path)
    if (list) list.push(file)
    else buckets.set(file.path, [file])
  }
  const ordered: T[] = []
  for (const path of paths) {
    const list = buckets.get(path)
    const next = list?.shift()
    if (next) ordered.push(next)
  }
  for (const list of buckets.values()) {
    for (const file of list) ordered.push(file)
  }
  return ordered
}

export type ReviewTreeStop = {
  key: string
  kind: "dir" | "file"
  parentKey: string | null
  expanded: boolean
  directoryId: string | null
  path: string | null
}

export type ReviewTreeMotion =
  | { type: "focus"; key: string }
  | { type: "expand"; directoryId: string; key: string }
  | { type: "collapse"; directoryId: string; key: string }
  | { type: "toggle"; directoryId: string; key: string }
  | { type: "select"; path: string; key: string }
  | { type: "ignore" }

const TREE_MOTION_IGNORE: ReviewTreeMotion = { type: "ignore" }

export function reviewTreeFileKey(path: string): string {
  return `file:${path}`
}

export function reviewTreeDirectoryKey(id: string): string {
  return `dir:${id}`
}

function filterDirectory(node: ReviewTreeDirNode, query: string): ReviewTreeDirNode | null {
  const children: ReviewTreeNode[] = []
  for (const child of node.children) {
    if (child.kind === "file") {
      if (child.path.toLowerCase().includes(query)) children.push(child)
      continue
    }
    const nested = filterDirectory(child, query)
    if (nested) children.push(nested)
  }
  if (children.length === 0) return null
  return { ...node, children }
}

/** Matching directories stay open. An empty query returns the same node list. */
export function filterReviewTree(nodes: readonly ReviewTreeNode[], query: string): readonly ReviewTreeNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes
  const result: ReviewTreeNode[] = []
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path.toLowerCase().includes(needle)) result.push(node)
      continue
    }
    const filtered = filterDirectory(node, needle)
    if (filtered) result.push(filtered)
  }
  return result
}

/**
 * Depth-first rows that arrow keys can land on.
 * Children of a collapsed directory stay mounted in the DOM, but they are not stops.
 */
export function visibleReviewStops(
  nodes: readonly ReviewTreeNode[],
  collapsedIds: ReadonlySet<string>,
): ReviewTreeStop[] {
  const stops: ReviewTreeStop[] = []
  const walk = (list: readonly ReviewTreeNode[], parentKey: string | null) => {
    for (const node of list) {
      if (node.kind === "file") {
        stops.push({
          key: reviewTreeFileKey(node.path),
          kind: "file",
          parentKey,
          expanded: false,
          directoryId: null,
          path: node.path,
        })
        continue
      }
      const key = reviewTreeDirectoryKey(node.id)
      const expanded = !collapsedIds.has(node.id)
      stops.push({
        key,
        kind: "dir",
        parentKey,
        expanded,
        directoryId: node.id,
        path: null,
      })
      if (expanded) walk(node.children, key)
    }
  }
  walk(nodes, null)
  return stops
}

/**
 * WAI-ARIA tree keyboard. Right on a closed directory expands it and leaves focus there.
 * Right on an open directory moves to the first child. Left on an open directory collapses it.
 * Left on a file or a closed directory moves to the parent. Enter selects a file.
 */
export function reviewTreeKeyMotion(
  stops: readonly ReviewTreeStop[],
  currentKey: string,
  key: string,
  filtering: boolean,
): ReviewTreeMotion {
  const index = stops.findIndex((stop) => stop.key === currentKey)
  if (index < 0) return TREE_MOTION_IGNORE
  const current = stops[index]
  if (key === "ArrowDown") {
    const next = stops[index + 1]
    return next ? { type: "focus", key: next.key } : TREE_MOTION_IGNORE
  }
  if (key === "ArrowUp") {
    const previous = stops[index - 1]
    return previous ? { type: "focus", key: previous.key } : TREE_MOTION_IGNORE
  }
  if (key === "Home") {
    const first = stops[0]
    return first && first.key !== currentKey ? { type: "focus", key: first.key } : TREE_MOTION_IGNORE
  }
  if (key === "End") {
    const last = stops[stops.length - 1]
    return last && last.key !== currentKey ? { type: "focus", key: last.key } : TREE_MOTION_IGNORE
  }
  if (key === "ArrowRight") {
    if (current.kind !== "dir" || !current.directoryId) return TREE_MOTION_IGNORE
    if (!current.expanded) {
      if (filtering) return TREE_MOTION_IGNORE
      return { type: "expand", directoryId: current.directoryId, key: current.key }
    }
    const child = stops[index + 1]
    if (child && child.parentKey === current.key) return { type: "focus", key: child.key }
    return TREE_MOTION_IGNORE
  }
  if (key === "ArrowLeft") {
    if (current.kind === "dir" && current.expanded && current.directoryId && !filtering) {
      return { type: "collapse", directoryId: current.directoryId, key: current.key }
    }
    return current.parentKey ? { type: "focus", key: current.parentKey } : TREE_MOTION_IGNORE
  }
  if (key === "Enter") {
    if (current.kind === "file" && current.path) return { type: "select", path: current.path, key: current.key }
    if (current.kind === "dir" && current.directoryId && !filtering) {
      return { type: "toggle", directoryId: current.directoryId, key: current.key }
    }
  }
  return TREE_MOTION_IGNORE
}

/** Stable across tree rebuilds that keep the same ancestor ids. */
export function reviewSelectionAncestorKey(
  ancestors: ReadonlyMap<string, readonly string[]>,
  selectedFile: string,
): string {
  const ids = ancestors.get(selectedFile)
  if (!ids || ids.length === 0) return ""
  return ids.join("\0")
}

export function directoryIdsInReviewTree(nodes: readonly ReviewTreeNode[]): string[] {
  const ids: string[] = []
  const walk = (list: readonly ReviewTreeNode[]) => {
    for (const node of list) {
      if (node.kind !== "dir") continue
      ids.push(node.id)
      walk(node.children)
    }
  }
  walk(nodes)
  return ids
}

/** Upper bound for the rail. An unmeasured pane does not cap a remembered width. */
export function reviewRailMaxWidth(paneWidth: number): number {
  if (!Number.isFinite(paneWidth) || paneWidth <= 0) return Number.POSITIVE_INFINITY
  return Math.max(REVIEW_RAIL_MIN_WIDTH, Math.floor(paneWidth * 0.5))
}

export function clampReviewRailWidth(width: number, paneWidth: number): number {
  const max = reviewRailMaxWidth(paneWidth)
  const rounded = Number.isFinite(width) ? Math.round(width) : REVIEW_RAIL_DEFAULT_WIDTH
  return Math.min(max, Math.max(REVIEW_RAIL_MIN_WIDTH, rounded))
}

export function reviewRailCollapseKey(directory: string, scope: string, nodeId: string): string {
  return `${directory}\0${scope}\0${nodeId}`
}

type ReviewRailSnapshot = {
  mode: ReviewRailMode
  width: number
  collapsed: ReadonlySet<string>
}

const serverSnapshot: ReviewRailSnapshot = {
  mode: "tree",
  width: REVIEW_RAIL_DEFAULT_WIDTH,
  collapsed: new Set<string>(),
}

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Private mode and blocked storage keep the choice in memory for this session.
  }
}

function readStoredMode(): ReviewRailMode {
  const value = readStorage(REVIEW_RAIL_MODE_STORAGE_KEY)
  return value === "list" || value === "tree" ? value : "tree"
}

function readStoredWidth(): number {
  const raw = readStorage(REVIEW_RAIL_WIDTH_STORAGE_KEY)
  if (raw === null) return REVIEW_RAIL_DEFAULT_WIDTH
  const value = Number(raw)
  return Number.isFinite(value) ? value : REVIEW_RAIL_DEFAULT_WIDTH
}

// Storage is read on the first subscription, not at module evaluation, so the server snapshot
// stays the pre-hydration value.
let snapshot: ReviewRailSnapshot = serverSnapshot
let storageHydrated = false

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function clientCollapsed(): ReadonlySet<string> {
  return snapshot.collapsed === serverSnapshot.collapsed ? new Set<string>() : snapshot.collapsed
}

function hydrateReviewRailStorage(): void {
  if (storageHydrated) return
  storageHydrated = true
  if (snapshot !== serverSnapshot) return
  const mode = readStoredMode()
  const width = readStoredWidth()
  if (mode === serverSnapshot.mode && width === serverSnapshot.width) return
  snapshot = { mode, width, collapsed: new Set<string>() }
}

export function subscribeReviewRail(listener: () => void): () => void {
  hydrateReviewRailStorage()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getReviewRailSnapshot(): ReviewRailSnapshot {
  return snapshot
}

export function getReviewRailServerSnapshot(): ReviewRailSnapshot {
  return serverSnapshot
}

export function getReviewRailMode(): ReviewRailMode {
  return snapshot.mode
}

export function setReviewRailMode(mode: ReviewRailMode): void {
  if (snapshot.mode === mode) return
  snapshot = { mode, width: snapshot.width, collapsed: clientCollapsed() }
  writeStorage(REVIEW_RAIL_MODE_STORAGE_KEY, mode)
  emit()
}

export function setReviewRailWidth(width: number): void {
  if (snapshot.width === width) return
  snapshot = { mode: snapshot.mode, width, collapsed: clientCollapsed() }
  writeStorage(REVIEW_RAIL_WIDTH_STORAGE_KEY, String(width))
  emit()
}

export function toggleReviewDirectory(directory: string, scope: string, nodeId: string): void {
  const key = reviewRailCollapseKey(directory, scope, nodeId)
  const collapsed = new Set(snapshot.collapsed)
  if (collapsed.has(key)) collapsed.delete(key)
  else collapsed.add(key)
  snapshot = { ...snapshot, collapsed }
  emit()
}

export function setReviewDirectoryCollapsed(directory: string, scope: string, nodeId: string, collapsed: boolean): void {
  const key = reviewRailCollapseKey(directory, scope, nodeId)
  const has = snapshot.collapsed.has(key)
  if (has === collapsed) return
  const next = new Set(snapshot.collapsed)
  if (collapsed) next.add(key)
  else next.delete(key)
  snapshot = { ...snapshot, collapsed: next }
  emit()
}

/** Open every directory between the root and a file so a landed selection is visible. */
export function revealReviewSelection(
  directory: string,
  scope: string,
  ancestorIds: readonly string[] | undefined,
): void {
  if (!ancestorIds || ancestorIds.length === 0) return
  let changed = false
  const collapsed = new Set(snapshot.collapsed)
  for (const nodeId of ancestorIds) {
    if (collapsed.delete(reviewRailCollapseKey(directory, scope, nodeId))) changed = true
  }
  if (!changed) return
  snapshot = { ...snapshot, collapsed }
  emit()
}

/** Drop collapse keys whose directory id is no longer in the tree for this viewer scope. */
export function pruneReviewDirectoryCollapse(directory: string, scope: string, liveIds: readonly string[]): void {
  const prefix = `${directory}\0${scope}\0`
  const live = new Set(liveIds)
  const collapsed = new Set(snapshot.collapsed)
  let changed = false
  for (const key of snapshot.collapsed) {
    if (!key.startsWith(prefix)) continue
    if (live.has(key.slice(prefix.length))) continue
    collapsed.delete(key)
    changed = true
  }
  if (!changed) return
  snapshot = { mode: snapshot.mode, width: snapshot.width, collapsed }
  emit()
}

export function hydrateReviewRailFromStorage(): void {
  storageHydrated = true
  const mode = readStoredMode()
  const width = readStoredWidth()
  if (snapshot.mode === mode && snapshot.width === width) return
  snapshot = {
    mode,
    width,
    collapsed: snapshot.collapsed === serverSnapshot.collapsed ? new Set<string>() : snapshot.collapsed,
  }
  emit()
}

export function resetReviewRailForTests(): void {
  try {
    globalThis.localStorage?.removeItem(REVIEW_RAIL_WIDTH_STORAGE_KEY)
    globalThis.localStorage?.removeItem(REVIEW_RAIL_MODE_STORAGE_KEY)
  } catch {
    // The in-memory snapshot below is the test baseline either way.
  }
  snapshot = serverSnapshot
  storageHydrated = false
  emit()
}

function getReviewRailServerMode(): ReviewRailMode {
  return serverSnapshot.mode
}

export function useReviewRailMode(): ReviewRailMode {
  return useSyncExternalStore(subscribeReviewRail, getReviewRailMode, getReviewRailServerMode)
}

export function useReviewRailSnapshot(): ReviewRailSnapshot {
  return useSyncExternalStore(subscribeReviewRail, getReviewRailSnapshot, getReviewRailServerSnapshot)
}
