import { create } from "zustand"
import type { UpdateInfo, UpdateProgress } from "@/lib/desktop"
import {
  checkForDesktopUpdates,
  downloadDesktopUpdate,
  restartToApplyUpdate,
  isDesktopLocalOriginActive,
  isDesktopShell,
  isWebRuntime,
} from "@/lib/desktop"
import {
  createMenuDialogRequest,
  type MenuDialogRequest,
  type MenuDialogOpenOptions,
} from "@/lib/menuDialogRequest"
import { withTimeout } from "@/lib/asyncTimeout"

// Bound the native update check so a hung updater IPC cannot latch
// `checking` (the timeout surfaces as a failed check). Downloads are
// deliberately unbounded — they can legitimately run for minutes and
// report progress while doing so.
const UPDATE_CHECK_TIMEOUT_MS = 30_000

// A user-triggered refresh (the sidebar brand button) skips a check that succeeded this recently.
const UPDATE_RECHECK_MIN_AGE_MS = 60_000

type UpdateState = {
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  info: UpdateInfo | null
  progress: UpdateProgress | null
  error: string | null
  runtimeType: "desktop" | "web" | null
  lastChecked: number | null
  nextCheckInSec: number | null
  updateDialogOpen: boolean
  updateDialogMenuRequest?: MenuDialogRequest
}

interface UpdateStore extends UpdateState {
  checkForUpdates: (opts?: { manual?: boolean }) => Promise<number | null>
  /**
   * Quiet refresh for a user action that is not an update request itself: no toast, the sidebar Update
   * button appears when a version is found. Runs as a manual check (an explicit action must not be
   * gated by the startup auto-update policy). Skipped while a check runs and for a recent success.
   */
  checkForUpdatesIfStale: (maxAgeMs?: number) => Promise<void>
  downloadUpdate: () => Promise<void>
  restartToUpdate: () => Promise<void>
  dismiss: () => void
  reset: () => void
  setUpdateDialogOpen: (open: boolean, options?: MenuDialogOpenOptions) => void
}

const UPDATE_FAILED_MESSAGE = "Update failed. Please try again or open the release page."
const RESTART_FAILED_MESSAGE = "Failed to restart AX Code."
let updateCheckRequestId = 0
let restartInFlight = false
let updateDownloadRequestId = 0

function detectRuntimeType(): "desktop" | "web" | null {
  if (isDesktopShell()) {
    // Only use the native updater when we're on the local instance.
    // When viewing a remote host inside the desktop shell, treat update as web update.
    return isDesktopLocalOriginActive() ? "desktop" : "web"
  }
  if (isWebRuntime()) return "web"
  return null
}

const initialState: UpdateState = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  info: null,
  progress: null,
  error: null,
  runtimeType: null,
  lastChecked: null,
  nextCheckInSec: null,
  updateDialogOpen: false,
  updateDialogMenuRequest: undefined,
}

export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  ...initialState,

  checkForUpdates: async (opts) => {
    const runtime = detectRuntimeType()
    if (!runtime) return null

    const requestId = ++updateCheckRequestId
    const isCurrentRequest = () => requestId === updateCheckRequestId
    set({ checking: true, error: null, runtimeType: runtime })

    try {
      if (runtime === "desktop") {
        // The desktop shell updates itself via its native updater
        // (electron-updater against the AX Code GitHub releases). That
        // result is authoritative — do not consult the OpenChamber npm/web
        // update API here, or the dialog would surface OpenChamber's package
        // version and changelog instead of AX Code's.
        const desktopInfo = await withTimeout(
          checkForDesktopUpdates(opts),
          UPDATE_CHECK_TIMEOUT_MS,
          (): UpdateInfo => ({ available: false, currentVersion: "", error: "Update check timed out" }),
        )
        if (!isCurrentRequest()) return null
        if (desktopInfo?.error) {
          console.warn("Desktop update check failed:", desktopInfo.error)
          set({
            checking: false,
            available: false,
            error: UPDATE_FAILED_MESSAGE,
            lastChecked: Date.now(),
            nextCheckInSec: null,
          })
          return null
        }
        set((state) => {
          // A staged download belongs to the version it was staged for. When
          // the check finds another version, leaving `downloaded` set made
          // "Restart to update" install the older package behind the new label.
          const stagedVersion = state.downloaded ? state.info?.version ?? null : null
          const nextVersion = desktopInfo?.version ?? null
          const keepStaged = stagedVersion !== null && stagedVersion === nextVersion
          return {
            checking: false,
            available: desktopInfo?.available ?? false,
            info: desktopInfo,
            lastChecked: Date.now(),
            nextCheckInSec: null,
            ...(keepStaged ? {} : { downloaded: false, progress: null }),
          }
        })

        return null
      }

      set({
        checking: false,
        available: false,
        info: null,
        lastChecked: Date.now(),
        nextCheckInSec: null,
      })
      return null
    } catch {
      if (!isCurrentRequest()) return null
      set({
        checking: false,
        error: UPDATE_FAILED_MESSAGE,
      })
      return null
    }
  },

  checkForUpdatesIfStale: async (maxAgeMs = UPDATE_RECHECK_MIN_AGE_MS) => {
    const { checking, lastChecked, error } = get()
    if (checking) return
    // A failed check is retried at once; only a recent success counts as fresh.
    if (lastChecked !== null && !error && Date.now() - lastChecked < maxAgeMs) return
    await get().checkForUpdates({ manual: true })
  },

  downloadUpdate: async () => {
    const { available, runtimeType } = get()

    // For web runtime, there's no download - user uses in-app update or CLI
    if (runtimeType !== "desktop" || !available) {
      return
    }

    const requestId = ++updateDownloadRequestId
    const isCurrentRequest = () => requestId === updateDownloadRequestId
    set({ downloading: true, error: null, progress: null })

    try {
      const ok = await downloadDesktopUpdate((progress) => {
        if (!isCurrentRequest()) return
        set({ progress })
      })
      if (!isCurrentRequest()) return
      if (!ok) {
        throw new Error("Desktop update only works on Local instance")
      }
      set({ downloading: false, downloaded: true })
    } catch (error) {
      console.warn("Failed to download desktop update:", error)
      if (!isCurrentRequest()) return
      set({
        downloading: false,
        error: UPDATE_FAILED_MESSAGE,
      })
    }
  },

  restartToUpdate: async () => {
    const { downloaded, runtimeType } = get()

    if (runtimeType !== "desktop" || !downloaded) {
      return
    }

    // The install can only be started once. A second click while the first is in flight made the
    // updater refuse the repeat (`handleQuitAndInstall` clears the gate once it sees no install
    // begin), and that refusal was then reported as "Failed to restart AX Code" although the
    // first install was already on its way.
    if (restartInFlight) {
      return
    }
    restartInFlight = true

    try {
      const ok = await restartToApplyUpdate()
      if (!ok) {
        throw new Error("Desktop restart only works on Local instance")
      }
    } catch (error) {
      console.warn("Failed to restart for desktop update:", error)
      set({
        error: RESTART_FAILED_MESSAGE,
      })
    } finally {
      // A restart that failed leaves the app running, so the user can try again.
      restartInFlight = false
    }
  },

  dismiss: () => {
    set({
      available: false, downloaded: false, info: null,
      updateDialogOpen: false, updateDialogMenuRequest: undefined,
    })
  },

  reset: () => {
    updateCheckRequestId += 1
    updateDownloadRequestId += 1
    set(initialState)
  },

  setUpdateDialogOpen: (open, options) => {
    set({
      updateDialogOpen: open,
      updateDialogMenuRequest: open && options?.fromMenu === true ? createMenuDialogRequest() : undefined,
    })
  },
}))
