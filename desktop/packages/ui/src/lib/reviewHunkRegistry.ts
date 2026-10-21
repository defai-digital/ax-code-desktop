import { createContext, useCallback, useContext, useSyncExternalStore } from "react"

import { reviewHunkIndexForAnchor, type ReviewHunkAnchor } from "./reviewHunkNavigation"

export type ReviewHunkFocus = {
  directory: string
  path: string
  hunkIndex: number
  nonce: number
  /** Line the user landed on. Republish resolves the hunk from this, not from the index. */
  anchor: Pick<ReviewHunkAnchor, "line" | "side">
  header?: string
}

export type ReviewHunkAnnouncement =
  | { kind: "position"; path: string; index: number; total: number; header?: string }
  | { kind: "edge"; edge: "first" | "last" }

export type ReviewHunkPending = {
  directory: string
  path: string
  hunkIndex: number | "first" | "last"
  direction: -1 | 1
}

type Resume = { directory: string; path: string; direction: -1 | 1 }

type Pane = {
  holders: Map<string, number>
  cache: Map<string, ReviewHunkAnchor[]>
  focus: ReviewHunkFocus | null
  announcement: ReviewHunkAnnouncement | null
  pending: ReviewHunkPending | null
  resume: Resume | null
  listeners: Set<() => void>
  nonce: number
}

export type ReviewHunkScopeValue = {
  id: string
  directory: string
}

export const ReviewHunkScopeContext = createContext<ReviewHunkScopeValue | null>(null)

export function useReviewHunkScope(): ReviewHunkScopeValue | null {
  return useContext(ReviewHunkScopeContext)
}

/** Scope key for a review pane. The directory is part of the key so a project switch drops the cursor. */
export function reviewPaneScopeKey(directory: string, scope: string): string {
  return `${directory}\0${scope}`
}

/** Cache key for one file in one repository. Paths repeat across projects; the directory does not. */
export function reviewHunkFileKey(directory: string, path: string): string {
  return `${directory}\0${path}`
}

const panes = new Map<string, Pane>()

/** Each mounted review pane keeps its own store. */
function resolveScopeId(scopeId: string): string {
  return scopeId
}

function emptyPane(): Pane {
  return {
    holders: new Map(),
    cache: new Map(),
    focus: null,
    announcement: null,
    pending: null,
    resume: null,
    listeners: new Set(),
    nonce: 0,
  }
}

function ensurePane(scopeId: string): Pane {
  const id = resolveScopeId(scopeId)
  let pane = panes.get(id)
  if (!pane) {
    pane = emptyPane()
    panes.set(id, pane)
  }
  return pane
}

function paneOf(scopeId: string): Pane | undefined {
  return panes.get(resolveScopeId(scopeId))
}

function emit(scopeId: string): void {
  const pane = paneOf(scopeId)
  if (!pane) return
  for (const listener of [...pane.listeners]) listener()
}

function emptySnapshot(): null {
  return null
}

export function watchReviewHunkStore(scopeId: string, listener: () => void): () => void {
  const pane = ensurePane(scopeId)
  pane.listeners.add(listener)
  return () => pane.listeners.delete(listener)
}

function assignFocus(pane: Pane, directory: string, path: string, hunkIndex: number, anchor: Pick<ReviewHunkAnchor, "line" | "side">): void {
  const anchors = pane.cache.get(reviewHunkFileKey(directory, path)) ?? []
  const header = anchors[hunkIndex]?.header
  pane.nonce += 1
  pane.pending = null
  pane.resume = null
  pane.focus = {
    directory,
    path,
    hunkIndex,
    nonce: pane.nonce,
    anchor: { line: anchor.line, side: anchor.side },
    header,
  }
  if (anchors.length > 0) {
    pane.announcement = { kind: "position", path, index: hunkIndex + 1, total: anchors.length, header }
  }
}

export function getReviewHunkAnchors(scopeId: string, directory: string, path: string): ReviewHunkAnchor[] | null {
  const pane = paneOf(scopeId)
  if (!pane) return null
  const key = reviewHunkFileKey(directory, path)
  return pane.cache.has(key) ? (pane.cache.get(key) ?? []) : null
}

export function getReviewHunkFocus(scopeId: string): ReviewHunkFocus | null {
  return paneOf(scopeId)?.focus ?? null
}

export function getReviewHunkAnnouncement(scopeId: string): ReviewHunkAnnouncement | null {
  return paneOf(scopeId)?.announcement ?? null
}

export function retainReviewHunks(scopeId: string, directory: string, path: string): void {
  const pane = ensurePane(scopeId)
  const key = reviewHunkFileKey(directory, path)
  pane.holders.set(key, (pane.holders.get(key) ?? 0) + 1)
}

export function releaseReviewHunks(scopeId: string, directory: string, path: string): void {
  const pane = paneOf(scopeId)
  if (!pane) return
  const key = reviewHunkFileKey(directory, path)
  const next = (pane.holders.get(key) ?? 1) - 1
  if (next <= 0) {
    pane.holders.delete(key)
    pane.cache.delete(key)
    if (pane.pending?.path === path && pane.pending.directory === directory) pane.pending = null
    return
  }
  pane.holders.set(key, next)
}

/** Replace the measured hunks for one file in one pane and repository. */
export function publishReviewHunks(
  scopeId: string,
  directory: string,
  path: string,
  anchors: readonly ReviewHunkAnchor[],
): void {
  const pane = ensurePane(scopeId)
  const next = anchors.slice()
  pane.cache.set(reviewHunkFileKey(directory, path), next)
  const pending = pane.pending
  if (pending?.path === path && pending.directory === directory) {
    const index =
      next.length === 0
        ? null
        : pending.hunkIndex === "first"
          ? 0
          : pending.hunkIndex === "last"
            ? next.length - 1
            : pending.hunkIndex >= 0 && pending.hunkIndex < next.length
              ? pending.hunkIndex
              : null
    if (index === null) {
      pane.pending = null
      pane.resume = { directory, path, direction: pending.direction }
    } else {
      assignFocus(pane, directory, path, index, next[index])
    }
    emit(scopeId)
    return
  }

  const focus = pane.focus
  if (focus?.path === path && focus.directory === directory) {
    if (next.length === 0) {
      pane.focus = null
      pane.announcement = null
    } else {
      const index = reviewHunkIndexForAnchor(next, focus.anchor, focus.hunkIndex)
      const header = index === null ? undefined : next[index]?.header
      if (index === null) {
        pane.focus = null
        pane.announcement = null
      } else if (index !== focus.hunkIndex || header !== focus.header) {
        assignFocus(pane, directory, path, index, focus.anchor)
      }
    }
  }
  emit(scopeId)
}

export function commitReviewHunkFocus(scopeId: string, directory: string, path: string, hunkIndex: number): void {
  const pane = paneOf(scopeId)
  const anchors = pane?.cache.get(reviewHunkFileKey(directory, path))
  if (!pane || !anchors || hunkIndex < 0 || hunkIndex >= anchors.length) return
  assignFocus(pane, directory, path, hunkIndex, anchors[hunkIndex])
  emit(scopeId)
}

export function setReviewHunkPending(scopeId: string, pending: ReviewHunkPending): void {
  const pane = ensurePane(scopeId)
  pane.pending = pending
  pane.resume = null
  emit(scopeId)
}

export function announceReviewHunkEdge(scopeId: string, edge: "first" | "last"): void {
  const pane = ensurePane(scopeId)
  pane.announcement = { kind: "edge", edge }
  emit(scopeId)
}

export function takeReviewHunkResume(scopeId: string): Resume | null {
  const pane = paneOf(scopeId)
  if (!pane?.resume) return null
  const resume = pane.resume
  pane.resume = null
  return resume
}

export function clearReviewHunkFocus(scopeId: string): void {
  const pane = paneOf(scopeId)
  if (!pane) return
  if (!pane.focus && !pane.pending && !pane.announcement && !pane.resume) return
  pane.focus = null
  pane.pending = null
  pane.announcement = null
  pane.resume = null
  emit(scopeId)
}

export function disposeReviewHunkScope(scopeId: string): void {
  const pane = paneOf(scopeId)
  if (!pane) return
  panes.delete(resolveScopeId(scopeId))
  pane.focus = null
  pane.announcement = null
  pane.pending = null
  pane.resume = null
  for (const listener of [...pane.listeners]) listener()
  pane.listeners.clear()
}

export function resetReviewHunkNavigation(): void {
  const all = [...panes.entries()]
  panes.clear()
  for (const [, pane] of all) {
    pane.focus = null
    pane.announcement = null
    pane.pending = null
    pane.resume = null
    for (const listener of [...pane.listeners]) listener()
    pane.listeners.clear()
  }
}

export function useReviewHunkFocus(path: string | null | undefined): ReviewHunkFocus | null {
  const scope = useReviewHunkScope()
  const scopeId = scope?.id ?? null
  const directory = scope?.directory
  const subscribe = useCallback(
    (listener: () => void) => (scopeId ? watchReviewHunkStore(scopeId, listener) : () => {}),
    [scopeId],
  )
  const getSnapshot = useCallback(() => (scopeId ? getReviewHunkFocus(scopeId) : null), [scopeId])
  const focus = useSyncExternalStore(subscribe, getSnapshot, emptySnapshot)
  if (!scopeId || directory === undefined || !path || !focus || focus.directory !== directory || focus.path !== path) return null
  return focus
}

export function useReviewHunkAnnouncement(): ReviewHunkAnnouncement | null {
  const scope = useReviewHunkScope()
  const scopeId = scope?.id ?? null
  const subscribe = useCallback(
    (listener: () => void) => (scopeId ? watchReviewHunkStore(scopeId, listener) : () => {}),
    [scopeId],
  )
  const getSnapshot = useCallback(() => (scopeId ? getReviewHunkAnnouncement(scopeId) : null), [scopeId])
  return useSyncExternalStore(subscribe, getSnapshot, emptySnapshot)
}
