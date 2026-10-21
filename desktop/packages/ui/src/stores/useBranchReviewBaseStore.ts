import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { getSafeStorage } from "./utils/safeStorage"

export const BRANCH_REVIEW_BASE_STORAGE_KEY = "ax-code-branch-review-base-v1"
export const BRANCH_REVIEW_BASE_MAX_DIRECTORIES = 100

type BranchReviewBaseState = {
  bases: Record<string, string>
  setBase: (directory: string, base: string | null) => void
}

function validEntry(directory: string, base: unknown): base is string {
  return (
    directory.length > 0 &&
    directory.length <= 4096 &&
    !directory.includes("\0") &&
    typeof base === "string" &&
    base.length > 0 &&
    base.length <= 1024 &&
    base.trim() === base &&
    !Array.from(base).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
}

function readBases(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([directory, base]) => validEntry(directory, base))
      .slice(-BRANCH_REVIEW_BASE_MAX_DIRECTORIES),
  )
}

/** Bounded preferences only; the view validates each restored choice against live branch names. */
export const useBranchReviewBaseStore = create<BranchReviewBaseState>()(
  persist(
    (set) => ({
      bases: {},
      setBase: (directory, base) => {
        if (base !== null && !validEntry(directory, base)) return
        set((state) => {
          const next = { ...state.bases }
          delete next[directory]
          if (base !== null) next[directory] = base
          return { bases: readBases(next) }
        })
      },
    }),
    {
      name: BRANCH_REVIEW_BASE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => getSafeStorage()),
      partialize: (state) => ({ bases: state.bases }),
      merge: (persisted, current) => ({
        ...current,
        bases: readBases((persisted as { bases?: unknown } | null)?.bases),
      }),
    },
  ),
)
