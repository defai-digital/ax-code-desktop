import { useEffect, useRef, type RefObject } from "react"

import {
  adjacentReviewHunk,
  resolveReviewHunkIndex,
  type ReviewHunkFile,
  type ReviewHunkTarget,
} from "@/lib/reviewHunkNavigation"
import {
  announceReviewHunkEdge,
  clearReviewHunkFocus,
  commitReviewHunkFocus,
  getReviewHunkAnchors,
  getReviewHunkFocus,
  setReviewHunkPending,
  takeReviewHunkResume,
  watchReviewHunkStore,
} from "@/lib/reviewHunkRegistry"
import { eventMatchesShortcut, getEffectiveShortcutCombo, isShortcutComboClaimed } from "@/lib/shortcuts"
import { reviewKeyboardEventInEditableField } from "@/stores/useReviewProgressStore"
import { useUIStore } from "@/stores/useUIStore"

const NEXT_ALIAS = "alt+arrowdown"
const PREVIOUS_ALIAS = "alt+arrowup"

export type ReviewHunkKeyFile = {
  path: string
  /** Set 0 for files that cannot have hunks (images). Omit to use the measured registry. */
  hunkCount?: 0
}

function measuredFiles(scopeId: string, directory: string, files: readonly ReviewHunkKeyFile[]): ReviewHunkFile[] {
  return files.map((file) => {
    if (file.hunkCount === 0) return { path: file.path, hunkCount: 0 }
    const anchors = getReviewHunkAnchors(scopeId, directory, file.path)
    return { path: file.path, hunkCount: anchors ? anchors.length : null }
  })
}

function hunkDirection(event: KeyboardEvent, overrides: Record<string, string>): -1 | 1 | null {
  if (eventMatchesShortcut(event, getEffectiveShortcutCombo("review_next_hunk", overrides))) return 1
  if (eventMatchesShortcut(event, getEffectiveShortcutCombo("review_previous_hunk", overrides))) return -1
  // Alt+Down / Alt+Up are aliases only while no registered shortcut already owns them.
  if (eventMatchesShortcut(event, NEXT_ALIAS) && !isShortcutComboClaimed(NEXT_ALIAS, overrides)) return 1
  if (eventMatchesShortcut(event, PREVIOUS_ALIAS) && !isShortcutComboClaimed(PREVIOUS_ALIAS, overrides)) return -1
  return null
}

/**
 * F7 / Shift+F7 move between change hunks in rail order. Alt+Down / Alt+Up do the
 * same when the shortcut registry does not already use them. The listener is the
 * review pane, same as ] / [ / v, and it stays quiet inside text fields.
 * `scopeId` is this pane only. A second mounted review does not share its cursor.
 */
export function useReviewHunkKeys(options: {
  paneRef: RefObject<HTMLElement | null>
  files: readonly ReviewHunkKeyFile[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
  scopeKey: string
  scopeId: string
  directory: string
}): void {
  const { paneRef, files, selectedFile, onSelectFile, scopeKey, scopeId, directory } = options
  const filesRef = useRef(files)
  const selectedRef = useRef(selectedFile)
  const onSelectRef = useRef(onSelectFile)
  const scopeIdRef = useRef(scopeId)
  const directoryRef = useRef(directory)
  const overrides = useUIStore((state) => state.shortcutOverrides)
  const overridesRef = useRef(overrides)
  // Path this hook asked the rail to select. The selectedFile effect ignores that one change.
  // Any other selected value, including a no-op select that never landed, still clears.
  const ownedSelectionRef = useRef<string | null>(null)
  filesRef.current = files
  selectedRef.current = selectedFile
  onSelectRef.current = onSelectFile
  scopeIdRef.current = scopeId
  directoryRef.current = directory
  overridesRef.current = overrides

  const applyTarget = useRef<(target: ReviewHunkTarget | null, direction: -1 | 1) => void>(() => {})
  applyTarget.current = (target, direction) => {
    let next = target
    const limit = filesRef.current.length + 1
    const paneId = scopeIdRef.current
    const repo = directoryRef.current
    for (let guard = 0; guard < limit && next; guard += 1) {
      const measured = measuredFiles(paneId, repo, filesRef.current)
      const known = measured.find((file) => file.path === next?.path)
      if (!known) return
      if (known.hunkCount === null) {
        setReviewHunkPending(paneId, { directory: repo, path: next.path, hunkIndex: next.hunkIndex, direction })
        if (next.path !== selectedRef.current) {
          ownedSelectionRef.current = next.path
          onSelectRef.current(next.path)
        }
        return
      }
      const index = resolveReviewHunkIndex(known.hunkCount, next.hunkIndex)
      if (index === null) {
        const from = measured.findIndex((file) => file.path === next?.path)
        next = from < 0 ? null : adjacentReviewHunk(measured, { path: known.path, hunkIndex: 0 }, direction)
        continue
      }
      commitReviewHunkFocus(paneId, repo, next.path, index)
      if (next.path !== selectedRef.current) {
        ownedSelectionRef.current = next.path
        onSelectRef.current(next.path)
      }
      return
    }
  }

  useEffect(() => {
    ownedSelectionRef.current = null
    clearReviewHunkFocus(scopeId)
  }, [scopeId, scopeKey])

  useEffect(() => {
    const owned = ownedSelectionRef.current
    ownedSelectionRef.current = null
    if (owned !== null && owned === selectedFile) return
    const focus = getReviewHunkFocus(scopeId)
    if (focus && focus.path !== selectedFile) clearReviewHunkFocus(scopeId)
  }, [scopeId, selectedFile])

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    const onStore = () => {
      const paneId = scopeIdRef.current
      const resume = takeReviewHunkResume(paneId)
      if (!resume || resume.directory !== directoryRef.current) return
      const measured = measuredFiles(paneId, directoryRef.current, filesRef.current)
      const target = adjacentReviewHunk(measured, { path: resume.path, hunkIndex: 0 }, resume.direction)
      applyTarget.current(target, resume.direction)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey) return
      const direction = hunkDirection(event, overridesRef.current)
      if (!direction) return
      if (reviewKeyboardEventInEditableField(event)) return

      const paneId = scopeIdRef.current
      const repo = directoryRef.current
      const measured = measuredFiles(paneId, repo, filesRef.current)
      const focus = getReviewHunkFocus(paneId)
      const cursor =
        focus && focus.path === selectedRef.current && focus.directory === repo
          ? { path: focus.path, hunkIndex: focus.hunkIndex }
          : null
      const target = adjacentReviewHunk(measured, cursor, direction, selectedRef.current)
      event.preventDefault()
      event.stopPropagation()
      if (!target) {
        announceReviewHunkEdge(paneId, direction > 0 ? "last" : "first")
        return
      }
      applyTarget.current(target, direction)
    }

    pane.addEventListener("keydown", onKeyDown)
    const unsubscribe = watchReviewHunkStore(scopeId, onStore)
    return () => {
      pane.removeEventListener("keydown", onKeyDown)
      unsubscribe()
    }
  }, [paneRef, scopeId])
}
