import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MotionConfig } from "motion/react"
import "@/styles/fonts"
import "@/index.css"
import "@/lib/debug"
import { SessionAuthGate } from "@/components/auth/SessionAuthGate"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { ThemeSystemProvider } from "@/contexts/ThemeSystemContext"
import type { RuntimeAPIs } from "@/lib/api/types"
import { startAppearanceAutoSave } from "@/lib/appearanceAutoSave"
import { applyPersistedDirectoryPreferences } from "@/lib/directoryPersistence"
import { initializeLocale, I18nProvider } from "@/lib/i18n"
import { initializeAppearancePreferences, syncDesktopSettings } from "@/lib/persistence"
import { startModelPrefsAutoSave } from "@/lib/modelPrefsAutoSave"
import { startTypographyWatcher } from "@/lib/typographyWatcher"
import { useUIStore } from "@/stores/useUIStore"
import { ElectronMiniChatApp } from "./ElectronMiniChatApp"

/**
 * Appearance settings live in the shared `ui-store`. A window only learns about the
 * other window's change by rehydrating from the storage event, and the mini chat has
 * no other path — without this it keeps the appearance it was opened with (font size,
 * font, padding, reasoning traces) until it is closed.
 */
const startSharedUiStoreSync = () => {
  if (typeof window === "undefined") return
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== "ui-store") return
    void useUIStore.persist.rehydrate()
  })
}

const initializeSharedPreferences = () => {
  startSharedUiStoreSync()
  const localeReady = initializeLocale()

  void initializeAppearancePreferences()
    .then(() => {
      void Promise.all([syncDesktopSettings(), applyPersistedDirectoryPreferences()]).catch((err) => {
        console.error("[mini-chat-main] settings init failed:", err)
      })

      startAppearanceAutoSave()
      startModelPrefsAutoSave()
      startTypographyWatcher()
    })
    .catch((err) => {
      console.error("[mini-chat-main] appearance init failed:", err)
    })
  return localeReady
}

export function renderElectronMiniChatApp(apis: RuntimeAPIs) {
  const localeReady = initializeSharedPreferences()

  const rootElement = document.getElementById("root")
  if (!rootElement) {
    throw new Error("Root element not found")
  }

  void localeReady.then(() =>
    createRoot(rootElement).render(
      <StrictMode>
        <I18nProvider>
          <ThemeSystemProvider>
            <ThemeProvider>
              {/* Honour the OS "reduce motion" setting in motion/react animations. */}
              <MotionConfig reducedMotion="user">
                <SessionAuthGate>
                  <ElectronMiniChatApp apis={apis} />
                </SessionAuthGate>
              </MotionConfig>
            </ThemeProvider>
          </ThemeSystemProvider>
        </I18nProvider>
      </StrictMode>,
    ),
  )
}
