import { startAppearanceAutoSave } from "@/lib/appearanceAutoSave"
import { initializeLocale } from "@/lib/i18n"
import { initializeAppearancePreferences } from "@/lib/persistence"
import { startModelPrefsAutoSave } from "@/lib/modelPrefsAutoSave"
import { startTypographyWatcher } from "@/lib/typographyWatcher"
import { useUIStore } from "@/stores/useUIStore"

/**
 * Appearance settings live in the shared `ui-store`. A window only learns about the
 * other window's change by rehydrating from the storage event, and a secondary window
 * has no other path — without this it keeps the appearance it was opened with (font
 * size, font, padding, reasoning traces) until it is closed.
 */
const startSharedUiStoreSync = () => {
  if (typeof window === "undefined") return
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== "ui-store") return
    void useUIStore.persist.rehydrate()
  })
}

/**
 * Shared preference bootstrap for secondary renderer windows (mini-chat and the
 * supervision pop-out). The returned promise settles once the locale can render.
 */
export const initializeSecondaryWindowPreferences = (logPrefix: string) => {
  startSharedUiStoreSync()
  const localeReady = initializeLocale()

  void initializeAppearancePreferences()
    .then(() => {
      startAppearanceAutoSave()
      startModelPrefsAutoSave()
      startTypographyWatcher()
    })
    .catch((err) => {
      console.error(`[${logPrefix}] appearance init failed:`, err)
    })
  return localeReady
}
