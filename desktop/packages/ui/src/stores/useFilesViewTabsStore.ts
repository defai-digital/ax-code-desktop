import { create } from "zustand"
import { createJSONStorage, devtools, persist } from "zustand/middleware"
import { hasPersistedFields } from "@/lib/persistedFields"

import {
  filesViewPathsEqual,
  isFilesViewPathWithinRoot,
  normalizeFilesViewPath as normalizePath,
} from "@/lib/filesViewPath"
import { clampFilesViewRoots, mergeFilesViewPaths, sanitizeFilesViewRoots } from "@/lib/filesViewTabsState"
import type { FilesViewRootTabsState } from "@/lib/filesViewTabsState"
import { isPlainRecord } from "@/lib/record"
import { getSafeStorage } from "./utils/safeStorage"

interface FilesViewTabsState {
  byRoot: Record<string, FilesViewRootTabsState>
}

interface FilesViewTabsActions {
  addOpenPath: (root: string, path: string) => void
  removeOpenPath: (root: string, path: string) => void
  removeOpenPathsByPrefix: (root: string, prefixPath: string) => void
  /** Drops a stale open path. The path on screen stays, so its tab keeps showing its own error. */
  removeUnselectedOpenPath: (root: string, path: string) => void
  setSelectedPath: (root: string, path: string | null) => void
  ensureSelectedPath: (root: string) => void
  toggleExpandedPath: (root: string, path: string) => void
  expandPath: (root: string, path: string) => void
  expandPaths: (root: string, paths: string[]) => void
}

type FilesViewTabsStore = FilesViewTabsState & FilesViewTabsActions

type RootUpdate = (current: FilesViewRootTabsState) => FilesViewRootTabsState

export const useFilesViewTabsStore = create<FilesViewTabsStore>()(
  devtools(
    persist(
      (set, get) => {
        const getRoot = (root: string) => {
          const byRoot = get().byRoot
          return Object.hasOwn(byRoot, root) ? byRoot[root] : undefined
        }
        const updateRoot = (root: string, update: RootUpdate, create = true) => {
          set((state) => {
            const previous = Object.hasOwn(state.byRoot, root) ? state.byRoot[root] : undefined
            if (!previous && !create) return state
            const current = previous ?? { openPaths: [], selectedPath: null, expandedPaths: [], touchedAt: 0 }
            const next = update(current)
            if (next === current) return state
            return {
              byRoot: clampFilesViewRoots(
                {
                  ...state.byRoot,
                  [root]: { ...next, touchedAt: Date.now() },
                },
                root,
              ),
            }
          })
        }
        return {
          byRoot: {},

          addOpenPath: (root, path) => {
            const normalizedRoot = normalizePath(root || "")
            const normalizedPath = normalizePath(path || "")
            if (!normalizedRoot || !normalizedPath || !isFilesViewPathWithinRoot(normalizedPath, normalizedRoot)) return
            updateRoot(normalizedRoot, (current) => {
              const exists = current.openPaths.some((candidate) => filesViewPathsEqual(candidate, normalizedPath))
              if (exists && current.selectedPath) return current
              return {
                ...current,
                openPaths: exists ? current.openPaths : [...current.openPaths, normalizedPath],
                selectedPath: current.selectedPath ?? normalizedPath,
              }
            })
          },

          removeOpenPath: (root, path) => {
            const normalizedRoot = normalizePath(root || "")
            const normalizedPath = normalizePath(path || "")
            if (!normalizedRoot || !normalizedPath) return
            updateRoot(
              normalizedRoot,
              (current) => {
                const matches = (candidate: string) => filesViewPathsEqual(candidate, normalizedPath)
                const selectedMatches = current.selectedPath ? matches(current.selectedPath) : false
                if (!current.openPaths.some(matches) && !selectedMatches) return current
                const openPaths = current.openPaths.filter((candidate) => !matches(candidate))
                return {
                  ...current,
                  openPaths,
                  selectedPath: selectedMatches ? (openPaths[0] ?? null) : current.selectedPath,
                }
              },
              false,
            )
          },

          removeOpenPathsByPrefix: (root, prefixPath) => {
            const normalizedRoot = normalizePath(root || "")
            const prefix = normalizePath(prefixPath || "")
            if (!normalizedRoot || !prefix) return
            updateRoot(
              normalizedRoot,
              (current) => {
                const withinPrefix = (candidate: string) => isFilesViewPathWithinRoot(candidate, prefix)
                const openPaths = current.openPaths.filter((candidate) => !withinPrefix(candidate))
                if (openPaths.length === current.openPaths.length) return current
                return {
                  ...current,
                  openPaths,
                  selectedPath:
                    current.selectedPath && withinPrefix(current.selectedPath)
                      ? (openPaths[0] ?? null)
                      : current.selectedPath,
                }
              },
              false,
            )
          },

          removeUnselectedOpenPath: (root, path) => {
            const normalizedRoot = normalizePath(root || "")
            const normalizedPath = normalizePath(path || "")
            const current = getRoot(normalizedRoot)
            if (!normalizedRoot || !normalizedPath || !current) return
            // Without a selection the first open path is on screen and must keep its error tab.
            const shownPath = current.selectedPath ?? current.openPaths[0] ?? null
            if (shownPath && filesViewPathsEqual(shownPath, normalizedPath)) return
            get().removeOpenPath(normalizedRoot, normalizedPath)
          },

          setSelectedPath: (root, path) => {
            const normalizedRoot = normalizePath(root || "")
            const normalizedPath = path ? normalizePath(path) : null
            if (!normalizedRoot || (normalizedPath && !isFilesViewPathWithinRoot(normalizedPath, normalizedRoot)))
              return
            updateRoot(normalizedRoot, (current) => {
              const openPaths =
                normalizedPath && !current.openPaths.some((candidate) => filesViewPathsEqual(candidate, normalizedPath))
                  ? [...current.openPaths, normalizedPath]
                  : current.openPaths
              if (getRoot(normalizedRoot) && current.selectedPath === normalizedPath && openPaths === current.openPaths)
                return current
              return { ...current, openPaths, selectedPath: normalizedPath }
            })
          },

          ensureSelectedPath: (root) => {
            const normalizedRoot = normalizePath(root || "")
            if (!normalizedRoot) return
            const current = getRoot(normalizedRoot)
            if (!current || current.selectedPath || !current.openPaths[0]) return
            get().setSelectedPath(normalizedRoot, current.openPaths[0])
          },

          toggleExpandedPath: (root, path) => {
            const normalizedRoot = normalizePath(root || "")
            const normalizedPath = normalizePath(path || "")
            if (!normalizedRoot || !normalizedPath || !isFilesViewPathWithinRoot(normalizedPath, normalizedRoot)) return
            updateRoot(normalizedRoot, (current) => {
              const matches = (candidate: string) => filesViewPathsEqual(candidate, normalizedPath)
              return {
                ...current,
                expandedPaths: current.expandedPaths.some(matches)
                  ? current.expandedPaths.filter((candidate) => !matches(candidate))
                  : [...current.expandedPaths, normalizedPath],
              }
            })
          },

          expandPath: (root, path) => get().expandPaths(root, [path]),

          expandPaths: (root, paths) => {
            const normalizedRoot = normalizePath(root || "")
            if (!normalizedRoot || !paths?.length) return
            const incoming = paths
              .map((path) => normalizePath(path || ""))
              .filter((path) => path && isFilesViewPathWithinRoot(path, normalizedRoot))
            if (!incoming.length) return
            updateRoot(normalizedRoot, (current) => {
              const expandedPaths = mergeFilesViewPaths(current.expandedPaths, incoming)
              if (expandedPaths.length === current.expandedPaths.length) return current
              return { ...current, expandedPaths }
            })
          },
        }
      },
      {
        name: "files-view-tabs-store",
        version: 2,
        storage: createJSONStorage(() => getSafeStorage()),
        migrate: (persistedState) => ({
          byRoot: sanitizeFilesViewRoots(isPlainRecord(persistedState) ? persistedState.byRoot : undefined),
        }),
        merge: (persistedState, currentState) => {
          if (!hasPersistedFields(persistedState, ["byRoot"])) return currentState
          return { ...currentState, byRoot: sanitizeFilesViewRoots(persistedState.byRoot) }
        },
        partialize: (state) => ({ byRoot: state.byRoot }),
      },
    ),
    { name: "files-view-tabs-store" },
  ),
)
