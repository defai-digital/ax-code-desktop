import { create } from "zustand"
import { axCodeClient } from "@/lib/ax-code/client"
import { toast } from "@/components/ui"
import { useI18nStore, formatMessage } from "@/lib/i18n/store"
import { normalizeDirectoryKey } from "@/stores/utils/directoryKey"
import { withTimeout } from "@/lib/asyncTimeout"

// Never let a stalled request keep the toggle spinning + disabled forever: bound
// the isolation read/write so `pending` always clears and the control stays usable.
const SANDBOX_REQUEST_TIMEOUT_MS = 12_000
const refreshAfterPending = new Set<string>()

/**
 * Sandbox (isolation) mode toggle for the desktop UI. The AX Code server
 * persists isolation to ax-code.json scoped by directory. Sandbox is "on"
 * when the isolation mode is not "full-access" (i.e. "read-only" or
 * "workspace-write"). Toggling sandbox off sets mode to "full-access";
 * toggling it back on restores the last restricted mode we saw for the
 * directory (so a configured "read-only" is not silently upgraded to
 * "workspace-write"), defaulting to "workspace-write".
 */

type RestrictedMode = "read-only" | "workspace-write"

const isRestrictedMode = (mode: string): mode is RestrictedMode => mode === "read-only" || mode === "workspace-write"

type SandboxState = {
  sandboxByDirectory: Record<string, boolean>
  pendingByDirectory: Record<string, boolean>
  restrictedModeByDirectory: Record<string, RestrictedMode>
}

type SandboxActions = {
  isSandbox: (directory: string | null | undefined) => boolean | undefined
  isPending: (directory: string | null | undefined) => boolean
  loadSandbox: (directory: string | null | undefined) => Promise<void>
  setSandbox: (directory: string | null | undefined, enabled: boolean) => Promise<void>
}

type SandboxStore = SandboxState & SandboxActions

export const useSandboxStore = create<SandboxStore>()((set, get) => ({
  sandboxByDirectory: {},
  pendingByDirectory: {},
  restrictedModeByDirectory: {},

  isSandbox: (directory) => get().sandboxByDirectory[normalizeDirectoryKey(directory)],
  isPending: (directory) => get().pendingByDirectory[normalizeDirectoryKey(directory)] === true,

  loadSandbox: async (directory) => {
    if (typeof directory !== "string" || !directory.trim()) return
    const key = normalizeDirectoryKey(directory)
    // No "already loaded" latch: isolation can change out-of-band (CLI,
    // other windows) and is not pushed over SSE, so re-fetch whenever a
    // consumer mounts. The last confirmed state stays visible while loading.
    if (get().pendingByDirectory[key]) {
      refreshAfterPending.add(key)
      return
    }

    set((s) => ({ pendingByDirectory: { ...s.pendingByDirectory, [key]: true } }))

    let isolation: Awaited<ReturnType<typeof axCodeClient.getIsolation>> | null = null
    try {
      isolation = await withTimeout(axCodeClient.getIsolation(directory), SANDBOX_REQUEST_TIMEOUT_MS, () => null)
    } catch {
      isolation = null
    }

    set((s) => {
      const next: Partial<SandboxState> = {
        pendingByDirectory: { ...s.pendingByDirectory, [key]: false },
      }
      if (isolation !== null) {
        next.sandboxByDirectory = {
          ...s.sandboxByDirectory,
          [key]: isolation.mode !== "full-access",
        }
        if (isRestrictedMode(isolation.mode)) {
          next.restrictedModeByDirectory = { ...s.restrictedModeByDirectory, [key]: isolation.mode }
        }
      }
      return next
    })
    if (refreshAfterPending.delete(key)) await get().loadSandbox(directory)
  },

  setSandbox: async (directory, enabled) => {
    if (typeof directory !== "string" || !directory.trim()) return
    const key = normalizeDirectoryKey(directory)
    const previous = get().sandboxByDirectory[key]
    if (previous === enabled || get().pendingByDirectory[key]) return

    // Optimistic: reflect the target immediately, mark pending.
    set((s) => ({
      sandboxByDirectory: { ...s.sandboxByDirectory, [key]: enabled },
      pendingByDirectory: { ...s.pendingByDirectory, [key]: true },
    }))

    const mode = enabled ? (get().restrictedModeByDirectory[key] ?? "workspace-write") : "full-access"
    let result: Awaited<ReturnType<typeof axCodeClient.setIsolation>> | null = null
    let timedOut = false
    try {
      const write = axCodeClient.setIsolation(mode, directory)
      void write.then(() => {
        if (timedOut) void get().loadSandbox(directory)
      }, () => {
        if (timedOut) void get().loadSandbox(directory)
      })
      result = await withTimeout(write, SANDBOX_REQUEST_TIMEOUT_MS, () => {
        timedOut = true
        return null
      })
    } catch {
      result = null
    }

    set((s) => {
      const pendingByDirectory = { ...s.pendingByDirectory, [key]: false }
      if (result === null) {
        // Revert to the last confirmed state (or drop the optimistic value).
        const sandboxByDirectory = { ...s.sandboxByDirectory }
        if (previous === undefined) {
          delete sandboxByDirectory[key]
        } else {
          sandboxByDirectory[key] = previous
        }
        return { sandboxByDirectory, pendingByDirectory }
      }
      const next: Partial<SandboxState> = {
        sandboxByDirectory: { ...s.sandboxByDirectory, [key]: result.mode !== "full-access" },
        pendingByDirectory,
      }
      if (isRestrictedMode(result.mode)) {
        next.restrictedModeByDirectory = { ...s.restrictedModeByDirectory, [key]: result.mode }
      }
      return next
    })

    const refreshQueued = refreshAfterPending.delete(key)
    if (result === null) {
      toast.error(formatMessage(useI18nStore.getState().dictionary, "chat.chatInput.sandbox.updateFailed"))
      // The write may still have landed on the server even though the response was
      // lost to the timeout: re-read it so the toggle converges with the server
      // instead of staying on the reverted value.
      await get().loadSandbox(directory)
    } else if (refreshQueued) {
      await get().loadSandbox(directory)
    }
  },
}))
