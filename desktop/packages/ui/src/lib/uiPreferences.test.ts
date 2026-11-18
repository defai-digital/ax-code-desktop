import { expect, test } from "vitest"
import { useUIStore } from "@/stores/useUIStore"
import { MAX_DIFF_FILE_LAYOUTS, uiPreferencePersistence } from "./uiPreferences"

test("serialization keeps preferences and leaves window navigation/dialogs out", () => {
  const current = useUIStore.getState()
  const live = {
    ...current,
    activeMainTab: "git",
    isSessionSwitcherOpen: true,
    isSessionCreateDialogOpen: true,
    isSettingsDialogOpen: true,
    theme: "light" as const,
    isSidebarOpen: false,
    fontSize: 105,
  }
  const saved = uiPreferencePersistence.partialize(live)
  expect(saved).toMatchObject({ theme: "light", isSidebarOpen: false, fontSize: 105 })
  for (const key of [
    "activeMainTab",
    "isSessionSwitcherOpen",
    "isSessionCreateDialogOpen",
    "isSettingsDialogOpen",
    "browserPanel",
    "sessionGrid",
  ])
    expect(saved).not.toHaveProperty(key)
})
test("restores safe model lists and bounded layout maps without allowing malformed collection rows", () => {
  const current = useUIStore.getState()
  const layouts = Object.fromEntries(Array.from({ length: 510 }, (_, index) => [`/repo\0${index}.ts`, "inline"]))
  const restored = uiPreferencePersistence.merge(
    {
      favoriteModels: [null, { providerID: "p", modelID: "m" }, { providerID: "p", modelID: "m" }, { providerID: 42 }],
      recentEfforts: { good: ["high", 42], bad: null },
      diffFileLayout: layouts,
      shortcutOverrides: { good: "Mod+K", bad: 42 },
    },
    current,
  )
  expect(restored.favoriteModels).toEqual([{ providerID: "p", modelID: "m" }])
  expect(restored.recentEfforts).toEqual({ good: ["high"] })
  expect(Object.keys(restored.diffFileLayout)).toHaveLength(MAX_DIFF_FILE_LAYOUTS)
  expect(restored.shortcutOverrides).toEqual({ good: "Mod+K" })
})
test("unknown enums and malformed nested templates keep current preferences", () => {
  const current = useUIStore.getState()
  const restored = uiPreferencePersistence.merge(
    {
      theme: "future",
      uiFont: "unknown",
      notificationMode: "future",
      notificationTemplates: { completion: { title: "Custom", message: {} }, error: null },
    },
    current,
  )
  expect(restored.theme).toBe(current.theme)
  expect(restored.uiFont).toBe(current.uiFont)
  expect(restored.notificationMode).toBe(current.notificationMode)
  expect(restored.notificationTemplates.completion).toEqual({
    ...current.notificationTemplates.completion,
    title: "Custom",
  })
  expect(restored.notificationTemplates.error).toEqual(current.notificationTemplates.error)
})
