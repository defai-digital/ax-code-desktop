import { useEffect, type RefObject } from "react"
import { reviewDirectoryKey } from "@/lib/reviewDirectoryKey"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { GitStatus } from "@/lib/api/types"
import { describeGitChange } from "@/components/views/git/changeDescriptors"
import { orderReviewRailFiles } from "@/components/views/reviewFileRailTree"
import { getSafeStorage } from "./utils/safeStorage"

/**
 * Review progress persisted per repository directory and scope. A mark matches only while the
 * file's signature is unchanged, so a rewrite clears "viewed" after a reload too.
 */
export type ReviewProgressFile = GitStatus["files"][number] & {
  insertions: number
  deletions: number
}

export type ReviewGitScope = "working" | "staged" | "all"

export type ReviewFileSignature = {
  signature: string
  /** True when blob ids were missing and the count-based signature was used. */
  fallback: boolean
}

/** Versioned storage key. Bump the suffix when the persisted mark shape changes. */
export const REVIEW_PROGRESS_STORAGE_KEY = "ax-code-review-progress-v1"
export const REVIEW_PROGRESS_STORAGE_VERSION = 1

export type ReviewKeyFile = {
  path: string
  signature: string
}

const TEXT_ENTRY_TYPES = new Set(["", "text", "search", "email", "url", "password", "tel", "number"])

export function reviewProgressKey(directory: string, scope: string, path: string): string {
  return `${reviewDirectoryKey(directory)}\u0000${scope}\u0000${path}`
}

const BLOB_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i

function countSignature(file: ReviewProgressFile): string {
  // Both status columns: moving a change between the index and the working tree is a new state to review,
  // even when the combined line counts and the displayed letter stay the same.
  return `${file.insertions}:${file.deletions}:${describeGitChange(file).code}:${file.index}${file.working_dir}`
}

function normalizeBlobId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  return BLOB_ID_PATTERN.test(trimmed) ? trimmed : null
}

function statusColumn(value: string | undefined): string {
  return (value ?? "").trim()
}

function sideExpectations(file: ReviewProgressFile): { head: boolean; index: boolean; worktree: boolean } {
  const index = statusColumn(file.index)
  const working = statusColumn(file.working_dir)
  const untracked = index === "?" || working === "?"
  const worktreeDeleted = working === "D" || (index === "D" && working === "")
  return {
    head: !untracked && index !== "A" && index !== "R" && index !== "C",
    index: !untracked && index !== "D",
    worktree: !worktreeDeleted,
  }
}

type SignatureSide = { missing: true } | { missing: false; token: string }

function signatureSide(value: string | null | undefined, expected: boolean): SignatureSide {
  const id = normalizeBlobId(value)
  if (id) return { missing: false, token: id }
  if (!expected && (value === undefined || value === null || value === "")) return { missing: false, token: "-" }
  return { missing: true }
}

function gitScopeOf(scope: string | undefined): ReviewGitScope | null {
  if (scope === "working" || scope === "staged" || scope === "all") return scope
  if (scope === undefined) return "all"
  return null
}

/**
 * Git scopes sign the path, the status columns, and the blob ids of the sides that scope reviews.
 * Working is the index id plus the worktree id, staged is the HEAD id plus the index id, and all
 * is all three. A null id is a real absence (deleted, untracked, new). A missing id — omitted,
 * or null on a side that should have one — falls back to the count signature and sets `fallback`.
 */
export function reviewFileSignatureDetail(file: ReviewProgressFile, scope?: string): ReviewFileSignature {
  const counts = countSignature(file)
  const gitScope = gitScopeOf(scope)
  if (!gitScope) return { signature: counts, fallback: true }

  const expected = sideExpectations(file)
  const head = signatureSide(file.headBlobId, expected.head)
  const index = signatureSide(file.indexBlobId, expected.index)
  const worktree = signatureSide(file.worktreeBlobId, expected.worktree)
  const sides: SignatureSide[] =
    gitScope === "working" ? [index, worktree] : gitScope === "staged" ? [head, index] : [head, index, worktree]
  if (sides.some((side) => side.missing)) return { signature: counts, fallback: true }

  const tokens = sides.map((side) => (side.missing ? "-" : side.token))
  return {
    signature: `id:${gitScope}:${file.path}\0${describeGitChange(file).code}:${file.index}${file.working_dir}\0${tokens.join(":")}`,
    fallback: false,
  }
}

export function reviewFileSignature(file: ReviewProgressFile, scope?: string): string {
  return reviewFileSignatureDetail(file, scope).signature
}

const BRANCH_BEFORE_BLOB_STATUSES = new Set(["modified", "deleted", "renamed", "copied"])

/**
 * Branch marks sign the merge-base, the before blob id, and a content hash of the after text.
 * Added and untracked files have no before blob. Missing ids fall back to the after-content hash.
 */
export function reviewBranchFileSignature(
  file: {
    path: string
    status: string
    after: string
    additions: number
    deletions: number
    binary?: boolean
    tooLarge?: boolean
    beforeBlobId?: string | null
  },
  mergeBase: string | null | undefined,
): ReviewFileSignature {
  const after =
    file.binary || file.tooLarge
      ? `\0${file.additions}:${file.deletions}:${file.binary ? "b" : ""}:${file.tooLarge ? "l" : ""}`
      : file.after
  const content = reviewContentSignature("", after, file.status, file.path)
  const base = normalizeBlobId(mergeBase)
  const before = normalizeBlobId(file.beforeBlobId)
  const beforeExpected = BRANCH_BEFORE_BLOB_STATUSES.has(file.status)
  // Binary or oversized rows carry counts and flags instead of content, so they cannot prove a same-count rewrite.
  if (!base || (beforeExpected && !before) || file.binary || file.tooLarge)
    return { signature: content, fallback: true }
  return {
    signature: `branch:${base}:${before ?? "-"}:${content}:${file.status}:${file.path}`,
    fallback: false,
  }
}

/** Fast synchronous 53-bit hash over UTF-16 code units; never persist diff text. */
function contentHash(input: string): string {
  let first = 0xdeadbeef
  let second = 0x41c6ce57
  for (let index = 0; index < input.length; index += 1) {
    const unit = input.charCodeAt(index)
    first = Math.imul(first ^ unit, 2654435761)
    second = Math.imul(second ^ unit, 1597334677)
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909)
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909)
  return (4294967296 * (second & 0x1fffff) + (first >>> 0)).toString(16)
}

/** Versioned signature binds both content sides, status and path without retaining their text. */
export function reviewContentSignature(before: string, after: string, status: string, path: string): string {
  return `content-v2:${contentHash(before)}:${contentHash(after)}:${contentHash(JSON.stringify([status, path]))}`
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
  // Full visual order. Files inside a collapsed directory stay reachable; the rail opens that directory.
  const ordered = orderReviewRailFiles(files)
  if (ordered.length === 0) return null
  const index = selectedFile === null ? -1 : ordered.findIndex((file) => file.path === selectedFile)
  if (index < 0) return offset > 0 ? ordered[0].path : null
  const nextIndex = index + offset
  if (nextIndex < 0 || nextIndex >= ordered.length) return null
  return ordered[nextIndex].path
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

function trimMarks(marks: Record<string, string>): Record<string, string> {
  const keys = Object.keys(marks)
  if (keys.length <= REVIEW_PROGRESS_MAX_MARKS) return marks
  const next: Record<string, string> = {}
  for (const key of keys.slice(keys.length - REVIEW_PROGRESS_MAX_MARKS)) next[key] = marks[key]
  return next
}

function readPersistedMarks(persisted: unknown): Record<string, string> | null {
  if (!persisted || typeof persisted !== "object") return null
  const marks = (persisted as { marks?: unknown }).marks
  if (!marks || typeof marks !== "object" || Array.isArray(marks)) return {}
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(marks)) {
    if (typeof value === "string") next[key] = value
  }
  return trimMarks(next)
}

export const useReviewProgressStore = create<ReviewProgressState>()(
  persist(
    (set, get) => ({
      marks: {},
      isViewed: (directory, scope, path, signature) =>
        get().marks[reviewProgressKey(directory, scope, path)] === signature,
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
    }),
    {
      name: REVIEW_PROGRESS_STORAGE_KEY,
      version: REVIEW_PROGRESS_STORAGE_VERSION,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({ marks: state.marks }),
      merge: (persisted, current) => {
        const marks = readPersistedMarks(persisted)
        return marks === null ? current : { ...current, marks }
      },
    },
  ),
)

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

      const ordered = orderReviewRailFiles(files)
      if (key === "v" || key === "V") {
        if (event.repeat || !selectedFile) return
        const index = ordered.findIndex((file) => file.path === selectedFile)
        if (index < 0) return
        event.preventDefault()
        const store = useReviewProgressStore.getState()
        const current = ordered[index]
        const wasViewed = store.isViewed(directory, scope, current.path, current.signature)
        store.toggleViewed(directory, scope, current.path, current.signature)
        // Un-marking keeps the file selected; only marking moves on to the next unviewed file.
        if (wasViewed) return
        for (let cursor = index + 1; cursor < ordered.length; cursor += 1) {
          const candidate = ordered[cursor]
          if (!store.isViewed(directory, scope, candidate.path, candidate.signature)) {
            onSelectFile(candidate.path)
            return
          }
        }
        return
      }

      const next = adjacentReviewFile(ordered, selectedFile, key === "]" ? 1 : -1)
      if (!next) return
      event.preventDefault()
      onSelectFile(next)
    }

    pane.addEventListener("keydown", onKeyDown)
    return () => pane.removeEventListener("keydown", onKeyDown)
  }, [directory, files, onSelectFile, paneRef, scope, selectedFile])
}
