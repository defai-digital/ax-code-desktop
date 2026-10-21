import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { InlineCommentDraft } from "@/lib/messages/inlineCommentDraft"
import { reviewDirectoryKey } from "@/lib/reviewDirectoryKey"
import { getSafeStorage } from "./utils/safeStorage"

export interface ReviewThread extends InlineCommentDraft {
  // startLine/endLine and code always describe the original selection, never a derived anchor.
  recipientSessionId: string
  status: "open" | "resolved"
  sentAt: number
}

export const MAX_REVIEW_THREADS = 200
/** Repositories kept; the least recently used drop first so one local storage record stays bounded. */
export const MAX_REVIEW_THREAD_DIRECTORIES = 30
/** A thread keeps at most this much of the commented code; re-anchoring searches for this prefix. */
export const MAX_REVIEW_THREAD_SNIPPET = 4000
export const EMPTY_REVIEW_THREADS: ReviewThread[] = []

function bounded(threads: ReviewThread[]): ReviewThread[] {
  const evict = [...threads].sort(
    (a, b) => Number(a.status === "open") - Number(b.status === "open") || a.sentAt - b.sentAt,
  )
  const removed = new Set(evict.slice(0, Math.max(0, threads.length - MAX_REVIEW_THREADS)).map((thread) => thread.id))
  return threads.filter((thread) => !removed.has(thread.id))
}

function boundedDirectories(byDirectory: Record<string, ReviewThread[]>): Record<string, ReviewThread[]> {
  const entries = Object.entries(byDirectory)
  if (entries.length <= MAX_REVIEW_THREAD_DIRECTORIES) return byDirectory
  const lastActive = (threads: ReviewThread[]) => threads.reduce((latest, thread) => Math.max(latest, thread.sentAt), 0)
  return Object.fromEntries(
    entries.sort((a, b) => lastActive(b[1]) - lastActive(a[1])).slice(0, MAX_REVIEW_THREAD_DIRECTORIES),
  )
}

function restoreThreads(input: unknown): Record<string, ReviewThread[]> {
  if (!input || typeof input !== "object") return {}
  return Object.fromEntries(
    Object.entries(input).flatMap(([directory, value]) => {
      if (!directory || !Array.isArray(value)) return []
      const threads = value.filter((thread): thread is ReviewThread => {
        if (!thread || typeof thread !== "object") return false
        return (
          ["id", "sessionKey", "recipientSessionId", "fileLabel", "code", "language", "text"].every(
            (key) => typeof thread[key] === "string",
          ) &&
          ["diff", "plan", "file", "preview-console", "preview-annotation"].includes(thread.source) &&
          (thread.side === "original" || thread.side === "modified") &&
          (thread.status === "open" || thread.status === "resolved") &&
          Number.isInteger(thread.startLine) &&
          thread.startLine > 0 &&
          Number.isInteger(thread.endLine) &&
          thread.endLine >= thread.startLine &&
          Number.isFinite(thread.createdAt) &&
          Number.isFinite(thread.sentAt)
        )
      })
      return [[directory, bounded(threads)]]
    }),
  )
}

function restoreBoundedThreads(input: unknown): Record<string, ReviewThread[]> {
  // Records saved under another spelling of the same directory (C:\Repo and C:/Repo) are merged into one.
  const merged: Record<string, ReviewThread[]> = {}
  for (const [directory, threads] of Object.entries(restoreThreads(input))) {
    const key = reviewDirectoryKey(directory)
    merged[key] = bounded([...(merged[key] ?? []), ...threads])
  }
  return boundedDirectories(merged)
}

/** Threads of a repository, whichever spelling of its directory the caller has. */
export function selectReviewThreads(state: { threadsByDirectory: Record<string, ReviewThread[]> }, directory: string | null) {
  return directory ? (state.threadsByDirectory[reviewDirectoryKey(directory)] ?? EMPTY_REVIEW_THREADS) : EMPTY_REVIEW_THREADS
}

interface ReviewThreadState {
  threadsByDirectory: Record<string, ReviewThread[]>
  recordSent: (directory: string, drafts: InlineCommentDraft[], recipientSessionId: string) => void
  setStatus: (directory: string, id: string, status: ReviewThread["status"]) => void
  recordResent: (directory: string, ids: string[], recipientSessionId: string) => void
}

export const useReviewThreadStore = create<ReviewThreadState>()(
  persist(
    (set) => ({
      threadsByDirectory: {},
      recordSent: (rawDirectory, drafts, recipientSessionId) =>
        set((state) => {
          const directory = reviewDirectoryKey(rawDirectory)
          const current = state.threadsByDirectory[directory] ?? []
          const existingIds = new Set(current.map((thread) => thread.id))
          const sentAt = Date.now()
          const added: ReviewThread[] = drafts.map((draft) => {
            // An edited draft may survive an in-flight send and be sent again later.
            const id = existingIds.has(draft.id) ? crypto.randomUUID() : draft.id
            existingIds.add(id)
            return {
              ...draft,
              id,
              code: draft.code.slice(0, MAX_REVIEW_THREAD_SNIPPET),
              side: draft.side ?? "modified",
              recipientSessionId,
              status: "open",
              sentAt,
            }
          })
          return {
            threadsByDirectory: boundedDirectories({
              ...state.threadsByDirectory,
              [directory]: bounded([...current, ...added]),
            }),
          }
        }),
      setStatus: (rawDirectory, id, status) =>
        set((state) => {
          const directory = reviewDirectoryKey(rawDirectory)
          return {
            threadsByDirectory: {
              ...state.threadsByDirectory,
              [directory]: (state.threadsByDirectory[directory] ?? []).map((thread) =>
                thread.id === id ? { ...thread, status } : thread,
              ),
            },
          }
        }),
      recordResent: (rawDirectory, ids, recipientSessionId) =>
        set((state) => {
          const directory = reviewDirectoryKey(rawDirectory)
          return {
            threadsByDirectory: {
              ...state.threadsByDirectory,
              [directory]: (state.threadsByDirectory[directory] ?? []).map((thread) =>
                ids.includes(thread.id) ? { ...thread, recipientSessionId, sentAt: Date.now() } : thread,
              ),
            },
          }
        }),
    }),
    {
      name: "ax-code-review-threads",
      version: 1,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({ threadsByDirectory: state.threadsByDirectory }),
      merge: (persisted, current) => ({
        ...current,
        threadsByDirectory: restoreBoundedThreads((persisted as Partial<ReviewThreadState> | null)?.threadsByDirectory),
      }),
    },
  ),
)
