import { beforeEach, expect, test } from "vitest"
import type { MenuDialogOpenOptions } from "@/lib/menuDialogRequest"
import { useUIStore } from "./useUIStore"
import { useUpdateStore } from "./useUpdateStore"

beforeEach(() => {
  useUIStore.getState().setAboutDialogOpen(false)
  useUIStore.getState().setSettingsDialogOpen(false)
  useUpdateStore.getState().reset()
})

const targets = [
  [
    "About",
    () => {
      const state = useUIStore.getState()
      return { open: state.isAboutDialogOpen, request: state.aboutDialogMenuRequest, setOpen: state.setAboutDialogOpen }
    },
  ],
  [
    "Settings",
    () => {
      const state = useUIStore.getState()
      return {
        open: state.isSettingsDialogOpen,
        request: state.settingsDialogMenuRequest,
        setOpen: state.setSettingsDialogOpen,
      }
    },
  ],
  [
    "Update",
    () => {
      const state = useUpdateStore.getState()
      return {
        open: state.updateDialogOpen,
        request: state.updateDialogMenuRequest,
        setOpen: state.setUpdateDialogOpen,
      }
    },
  ],
] as const

test.each(targets)("%s keeps each menu request fresh and clears it for close/ordinary open", (_name, read) => {
  read().setOpen(true, { fromMenu: true })
  const first = read().request
  expect(read().open).toBe(true)
  expect(first).toEqual({ fromMenu: true, requestedAt: expect.any(Number) })
  expect(Object.isFrozen(first)).toBe(true)
  read().setOpen(true, { fromMenu: true })
  expect(read().request).not.toBe(first)
  read().setOpen(false)
  expect(read().request).toBeUndefined()
  read().setOpen(true)
  expect(read().request).toBeUndefined()
})

test("menu requests are excluded from persisted UI preferences", () => {
  useUIStore.getState().setAboutDialogOpen(true, { fromMenu: true })
  useUIStore.getState().setSettingsDialogOpen(true, { fromMenu: true })
  const saved = useUIStore.persist.getOptions().partialize?.(useUIStore.getState())
  expect(saved).toBeDefined()
  expect(saved).not.toHaveProperty("aboutDialogMenuRequest")
  expect(saved).not.toHaveProperty("settingsDialogMenuRequest")
})

test("closing one dialog preserves the other dialog's request", () => {
  useUIStore.getState().setAboutDialogOpen(true, { fromMenu: true })
  useUIStore.getState().setSettingsDialogOpen(true, { fromMenu: true })
  const settings = useUIStore.getState().settingsDialogMenuRequest
  useUIStore.getState().setAboutDialogOpen(false)
  expect(useUIStore.getState().settingsDialogMenuRequest).toBe(settings)
})

test("updater dismiss/reset clear its transient request", () => {
  useUpdateStore.getState().setUpdateDialogOpen(true, { fromMenu: true })
  useUpdateStore.getState().dismiss()
  expect(useUpdateStore.getState()).toMatchObject({ updateDialogOpen: false, updateDialogMenuRequest: undefined })
  useUpdateStore.getState().setUpdateDialogOpen(true, { fromMenu: true })
  useUpdateStore.getState().reset()
  expect(useUpdateStore.getState()).toMatchObject({ updateDialogOpen: false, updateDialogMenuRequest: undefined })
})

test("Base UI callback details are not mistaken for menu-open options", () => {
  const details = { reason: "trigger-press" } as unknown as MenuDialogOpenOptions
  useUIStore.getState().setAboutDialogOpen(true, details)
  expect(useUIStore.getState().aboutDialogMenuRequest).toBeUndefined()
})
