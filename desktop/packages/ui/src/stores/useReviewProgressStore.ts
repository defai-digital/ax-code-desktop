import { useEffect, type RefObject } from "react"
import { create } from "zustand"

import type { GitStatus } from "@/lib/api/types"
import { describeGitChange } from "@/components/views/git/changeDescriptors"

/**
 * In-memory review progress. A mark matches only while the file's signature
 * is unchanged, so an agent edit clears "viewed" without a separate sweep.
 */
export type ReviewProgressFile = GitStatus["files"][number] & {
  insertions: number
  deletions: number
}

export type ReviewKeyFile = {
  path: string
  signature: string
}

const TEXT_ENTRY_TYPES = new Set(["", "text", "search", "email", "url", "password", "tel", "number"])

export function reviewProgressKey(directory: string, scope: string, path: string): string {
  return `${directory}\u0000${scope}\u0000${path}`
}

export function reviewFileSignature(file: ReviewProgressFile): string {
  // Both status columns: moving a change between the index and the working tree is a new state to review,
  // even when the combined line counts and the displayed letter stay the same.
  return `${file.insertions}:${file.deletions}:${describeGitChange(file).code}:${file.index}${file.working_dir}`
}

/** Marks kept at most; the oldest are dropped first so a long-lived window cannot grow without bound. */
export const REVIEW_PROGRESS_MAX_MARKS = 2000

function withMark(marks: Record<string, string>, key: string, signature: string): Record<string, string> {
  const next = { ...marks }
  // Re-inserting moves the key to the end, so insertion order is recency order.
  delete next[key]
  next[key] = signature
  const keys = Object.keys(next)
  for (let index = 0; index < keys.length - REVIEW_PROGRESS_MAX_MARKS; index++) delete next[keys[index]]
  return next
}

export function adjacentReviewFile(
  files: readonly { path: string }[],
  selectedFile: string | null,
  offset: -1 | 1,
): string | null {
  if (files.length === 0) return null
  const index = selectedFile === null ? -1 : files.findIndex((file) => file.path === selectedFile)
  if (index < 0) return offset > 0 ? files[0].path : null
  const nextIndex = index + offset
  if (nextIndex < 0 || nextIndex >= files.length) return null
  return files[nextIndex].path
}

export function isReviewEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const field = target.closest("input, textarea, select, [contenteditable='true']")
  if (!(field instanceof HTMLElement)) return false
  if (field instanceof HTMLInputElement) return TEXT_ENTRY_TYPES.has(field.type)
  return true
}

function eventPath(event: KeyboardEvent): EventTarget[] {
  return typeof event.composedPath === "function" ? event.composedPath() : event.target ? [event.target] : []
}

export function reviewKeyboardEventInEditableField(event: KeyboardEvent): boolean {
  return eventPath(event).some((node) => isReviewEditableTarget(node))
}

export function reviewKeyboardEventInTextControl(event: KeyboardEvent): boolean {
  return eventPath(event).some((node) => {
    if (!(node instanceof HTMLElement)) return false
    return node.tagName === "INPUT" || node.tagName === "TEXTAREA"
  })
}

type ReviewProgressState = {
  marks: Record<string, string>
  isViewed: (directory: string, scope: string, path: string, signature: string) => boolean
  toggleViewed: (directory: string, scope: string, path: string, signature: string) => void
  setViewed: (directory: string, scope: string, path: string, signature: string, viewed: boolean) => void
  clearDirectory: (directory: string) => void
}

export const useReviewProgressStore = create<ReviewProgressState>((set, get) => ({
  marks: {},
  isViewed: (directory, scope, path, signature) => get().marks[reviewProgressKey(directory, scope, path)] === signature,
  toggleViewed: (directory, scope, path, signature) => {
    const key = reviewProgressKey(directory, scope, path)
    set((state) => {
      if (state.marks[key] !== signature) return { marks: withMark(state.marks, key, signature) }
      const marks = { ...state.marks }
      delete marks[key]
      return { marks }
    })
  },
  setViewed: (directory, scope, path, signature, viewed) => {
    const key = reviewProgressKey(directory, scope, path)
    set((state) => {
      if (viewed) return { marks: withMark(state.marks, key, signature) }
      const marks = { ...state.marks }
      delete marks[key]
      return { marks }
    })
  },
  clearDirectory: (directory) => {
    const prefix = `${directory}\u0000`
    set((state) => {
      let changed = false
      const marks: Record<string, string> = {}
      for (const [key, value] of Object.entries(state.marks)) {
        if (key.startsWith(prefix)) {
          changed = true
          continue
        }
        marks[key] = value
      }
      return changed ? { marks } : state
    })
  },
}))

export function useReviewPaneFileKeys(options: {
  paneRef: RefObject<HTMLElement | null>
  directory: string | null | undefined
  scope: string
  files: readonly ReviewKeyFile[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}): void {
  const { paneRef, directory, scope, files, selectedFile, onSelectFile } = options

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return
      const key = event.key
      if (key !== "]" && key !== "[" && key !== "v" && key !== "V") return
      if (!directory) return
      if (reviewKeyboardEventInEditableField(event)) return

      if (key === "v" || key === "V") {
        if (event.repeat || !selectedFile) return
        const index = files.findIndex((file) => file.path === selectedFile)
        if (index < 0) return
        event.preventDefault()
        const store = useReviewProgressStore.getState()
        const current = files[index]
        const wasViewed = store.isViewed(directory, scope, current.path, current.signature)
        store.toggleViewed(directory, scope, current.path, current.signature)
        // Un-marking keeps the file selected; only marking moves on to the next unviewed file.
        if (wasViewed) return
        for (let cursor = index + 1; cursor < files.length; cursor += 1) {
          const candidate = files[cursor]
          if (!store.isViewed(directory, scope, candidate.path, candidate.signature)) {
            onSelectFile(candidate.path)
            return
          }
        }
        return
      }

      const next = adjacentReviewFile(files, selectedFile, key === "]" ? 1 : -1)
      if (!next) return
      event.preventDefault()
      onSelectFile(next)
    }

    pane.addEventListener("keydown", onKeyDown)
    return () => pane.removeEventListener("keydown", onKeyDown)
  }, [directory, files, onSelectFile, paneRef, scope, selectedFile])
}
