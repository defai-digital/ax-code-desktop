import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { getSafeStorage } from "./utils/safeStorage"

/** Most folders anyone dismisses hints for; the oldest entries go first. */
const MAX_REMEMBERED_FOLDERS = 200

type RepositoryHintStore = {
  /** Folder -> repository names that were present when the "repositories inside" hint was dismissed. */
  dismissedChildren: Record<string, string[]>
  /** Folder -> repository root whose "add the repository instead" hint was dismissed. */
  dismissedParent: Record<string, string>
  dismissChildren: (folder: string, repositoryNames: readonly string[]) => void
  dismissParent: (folder: string, gitRoot: string) => void
}

const keepRecent = <T>(record: Record<string, T>): Record<string, T> => {
  const entries = Object.entries(record)
  return entries.length <= MAX_REMEMBERED_FOLDERS ? record : Object.fromEntries(entries.slice(-MAX_REMEMBERED_FOLDERS))
}

/**
 * Remembers repository hints the user dismissed in the add-project browser. The "repositories inside"
 * hint comes back only when a repository appears that was not there at dismissal.
 */
export const useRepositoryHintStore = create<RepositoryHintStore>()(
  persist(
    (set) => ({
      dismissedChildren: {},
      dismissedParent: {},
      dismissChildren: (folder, repositoryNames) =>
        set((state) => {
          // Re-insert so the folder moves to the most recent position.
          const rest = { ...state.dismissedChildren }
          delete rest[folder]
          return { dismissedChildren: keepRecent({ ...rest, [folder]: [...repositoryNames].sort() }) }
        }),
      dismissParent: (folder, gitRoot) =>
        set((state) => {
          const rest = { ...state.dismissedParent }
          delete rest[folder]
          return { dismissedParent: keepRecent({ ...rest, [folder]: gitRoot }) }
        }),
    }),
    {
      name: "repository-hints",
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
    },
  ),
)

/** True when every repository now inside `folder` was already there when its hint was dismissed. */
export function isChildHintDismissed(
  dismissedChildren: Record<string, string[]>,
  folder: string,
  repositoryNames: readonly string[],
): boolean {
  const seen = dismissedChildren[folder]
  if (!seen) return false
  const known = new Set(seen)
  return repositoryNames.every((name) => known.has(name))
}
