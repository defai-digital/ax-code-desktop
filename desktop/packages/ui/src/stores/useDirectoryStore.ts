import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { axCodeClient } from "@/lib/ax-code/client"
import { updateDesktopSettings } from "@/lib/persistence"
import { normalizeProjectPath } from "@/lib/projectResolution"
import { useFileSearchStore } from "@/stores/useFileSearchStore"
import { streamDebugEnabled } from "@/stores/utils/streamDebug"
import { getSafeStorage } from "./utils/safeStorage"
import { expandHomePath } from "../../../../shared/path-values.mjs"

interface DirectoryNavigationStore {
  currentDirectory: string
  directoryHistory: string[]
  historyIndex: number
  homeDirectory: string
  hasPersistedDirectory: boolean
  isHomeReady: boolean

  setDirectory: (path: string) => void
  goBack: () => void
  goForward: () => void
  goToParent: () => void
  goHome: () => Promise<void>
  synchronizeHomeDirectory: (path: string, persist?: boolean) => void
}

let navigationRevision = 0
const safeStorage = getSafeStorage()
// Secondary renderers navigate independently; only the main renderer owns the startup project preference.
const persistLastDirectory = (directory: string) => {
  if (typeof window !== "undefined") {
    const { pathname, search } = window.location
    if (
      pathname.endsWith("/mini-chat.html") ||
      pathname.endsWith("/supervision.html") ||
      new URLSearchParams(search).get("ocPanel") === "session-chat"
    )
      return
  }
  safeStorage.setItem("lastDirectory", directory)
  void updateDesktopSettings({ lastDirectory: directory })
}

const invalidateFileSearchCache = (scope?: string | null) => {
  try {
    useFileSearchStore.getState().invalidateDirectory(scope)
  } catch (error) {
    console.warn("Failed to invalidate file search cache:", error)
  }
}

const normalizeDirectoryPath = (value: string): string => {
  return normalizeProjectPath(value) ?? ""
}

const resolveDirectoryPath = (path: string, homeDir?: string | null): string =>
  normalizeDirectoryPath(expandHomePath(path, homeDir))

const isFilesystemRoot = (path: string): boolean => path === "/" || /^[A-Z]:\/$/.test(path)

const getProcessHomeDirectory = (): string | null => {
  if (typeof process === "undefined") {
    return null
  }

  const env = process?.env
  const nodeHome =
    env?.HOME || env?.USERPROFILE || (env?.HOMEDRIVE && env?.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined)
  if (typeof nodeHome === "string" && nodeHome.trim().length > 0) {
    const normalized = normalizeDirectoryPath(nodeHome)
    return normalized.length > 0 ? normalized : null
  }

  const cwd = process?.cwd?.()
  if (typeof cwd === "string" && cwd.trim().length > 0) {
    const normalized = normalizeDirectoryPath(cwd)
    return normalized.length > 0 ? normalized : null
  }

  return null
}

const normalizeHomeCandidate = (value?: string | null) => {
  const normalized = normalizeProjectPath(value)
  return normalized === "/" ? null : normalized
}

const getHomeDirectory = () =>
  normalizeHomeCandidate(typeof window === "undefined" ? undefined : window.__AX_CODE_DESKTOP_HOME__) ??
  normalizeHomeCandidate(safeStorage.getItem("homeDirectory")) ??
  normalizeHomeCandidate(getProcessHomeDirectory()) ??
  ""

const discoverHomeDirectory = async () => {
  try {
    const home = normalizeHomeCandidate(await axCodeClient.getFilesystemHome())
    if (home) return home
  } catch (error) {
    console.warn("Failed to obtain filesystem home directory:", error)
  }

  try {
    const home = normalizeHomeCandidate((await axCodeClient.getSystemInfo()).homeDirectory)
    if (home) return home
  } catch (error) {
    console.warn("Failed to obtain home directory from system info:", error)
  }

  return useDirectoryStore.getState().homeDirectory || getHomeDirectory()
}

const scopeDirectory = (directory: string) => {
  axCodeClient.setDirectory(directory)
  invalidateFileSearchCache()
}

const initialHomeDirectory = getHomeDirectory()
const savedDirectory = normalizeProjectPath(safeStorage.getItem("lastDirectory"))
const initialCurrentDirectory = savedDirectory
  ? resolveDirectoryPath(savedDirectory, initialHomeDirectory)
  : initialHomeDirectory

if (initialCurrentDirectory) {
  axCodeClient.setDirectory(initialCurrentDirectory)
}
const initialIsHomeReady = Boolean(initialHomeDirectory)

export const useDirectoryStore = create<DirectoryNavigationStore>()(
  devtools(
    (set, get) => {
      const navigate = (directoryHistory: string[], historyIndex: number) => {
        navigationRevision += 1
        const currentDirectory = directoryHistory[historyIndex]
        scopeDirectory(currentDirectory)
        persistLastDirectory(currentDirectory)
        set({ currentDirectory, directoryHistory, historyIndex, hasPersistedDirectory: true, isHomeReady: true })
      }

      return {
        currentDirectory: initialCurrentDirectory,
        directoryHistory: [initialCurrentDirectory],
        historyIndex: 0,
        homeDirectory: initialHomeDirectory,
        hasPersistedDirectory: Boolean(savedDirectory),
        isHomeReady: initialIsHomeReady,

        setDirectory: (path: string) => {
          const state = get()
          const directory = resolveDirectoryPath(path, state.homeDirectory)
          if (streamDebugEnabled()) {
            console.log("[DirectoryStore] setDirectory called with path:", directory)
          }
          if (state.directoryHistory[state.historyIndex] === directory) {
            navigate(state.directoryHistory, state.historyIndex)
            return
          }
          const history = [...state.directoryHistory.slice(0, state.historyIndex + 1), directory]
          navigate(history, history.length - 1)
        },

        goBack: () => {
          const { directoryHistory, historyIndex } = get()
          if (historyIndex > 0) navigate(directoryHistory, historyIndex - 1)
        },

        goForward: () => {
          const { directoryHistory, historyIndex } = get()
          if (historyIndex < directoryHistory.length - 1) navigate(directoryHistory, historyIndex + 1)
        },

        goToParent: () => {
          const { currentDirectory, setDirectory } = get()
          const homeDir = get().homeDirectory || getHomeDirectory()
          const normalizedCurrentDirectory = normalizeDirectoryPath(currentDirectory)
          const normalizedHomeDirectory = normalizeDirectoryPath(homeDir)

          if (normalizedCurrentDirectory === normalizedHomeDirectory || isFilesystemRoot(normalizedCurrentDirectory)) {
            return
          }

          const cleanPath = normalizedCurrentDirectory.endsWith("/")
            ? normalizedCurrentDirectory.slice(0, -1)
            : normalizedCurrentDirectory

          const lastSlash = cleanPath.lastIndexOf("/")
          if (lastSlash === -1) {
            if (homeDir) setDirectory(homeDir)
          } else if (lastSlash === 0) {
            setDirectory("/")
          } else {
            setDirectory(cleanPath.substring(0, lastSlash))
          }
        },

        goHome: async () => {
          const revision = navigationRevision
          const home = get().homeDirectory || (await refreshDirectoryHome())
          if (home && revision === navigationRevision) get().setDirectory(home)
        },

        synchronizeHomeDirectory: (path: string, persist = true) => {
          const homeDirectory = normalizeHomeCandidate(path)
          if (!homeDirectory) return

          const state = get()
          const homeChanged = homeDirectory !== state.homeDirectory
          if (persist && safeStorage.getItem("homeDirectory") !== homeDirectory) {
            safeStorage.setItem("homeDirectory", homeDirectory)
            void updateDesktopSettings({ homeDirectory })
          }
          if (!homeChanged && state.isHomeReady) return

          const replaceDefault =
            navigationRevision === 0 &&
            !safeStorage.getItem("lastDirectory") &&
            (!state.currentDirectory || state.currentDirectory === "/" || state.currentDirectory === state.homeDirectory)
          const currentDirectory = replaceDefault
            ? homeDirectory
            : resolveDirectoryPath(state.currentDirectory, homeDirectory)
          const directoryHistory = replaceDefault
            ? [currentDirectory]
            : state.directoryHistory.map((entry) => resolveDirectoryPath(entry, homeDirectory))
          if (currentDirectory !== state.currentDirectory) scopeDirectory(currentDirectory)
          set({
            homeDirectory,
            currentDirectory,
            directoryHistory,
            historyIndex: replaceDefault ? 0 : state.historyIndex,
            isHomeReady: true,
          })
        },
      }
    },
    { name: "directory-store" },
  ),
)

export function restoreDirectoryPreferences(projectDirectory?: string) {
  const savedHome = safeStorage.getItem("homeDirectory")
  if (savedHome) useDirectoryStore.getState().synchronizeHomeDirectory(savedHome, false)

  // An embedded window or the reader may select a directory before the settings request resolves.
  if (navigationRevision !== 0) return
  const savedDirectory = normalizeProjectPath(safeStorage.getItem("lastDirectory"))
  const preferredDirectory = savedDirectory ?? projectDirectory
  if (!preferredDirectory) return

  const state = useDirectoryStore.getState()
  const currentDirectory = resolveDirectoryPath(preferredDirectory, state.homeDirectory)
  if (!currentDirectory) return
  if (currentDirectory !== state.currentDirectory) scopeDirectory(currentDirectory)
  useDirectoryStore.setState({
    currentDirectory,
    directoryHistory: [currentDirectory],
    historyIndex: 0,
    hasPersistedDirectory: Boolean(savedDirectory),
  })
}

let homeDiscovery: Promise<string> | null = null

export function refreshDirectoryHome() {
  homeDiscovery ??= discoverHomeDirectory()
    .then((home) => {
      useDirectoryStore.getState().synchronizeHomeDirectory(home)
      return home
    })
    .finally(() => {
      homeDiscovery = null
    })
  return homeDiscovery
}
