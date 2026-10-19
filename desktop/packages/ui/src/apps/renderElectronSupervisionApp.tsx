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
import { I18nProvider } from "@/lib/i18n"
import { ElectronSupervisionApp } from "./ElectronSupervisionApp"
import { initializeSecondaryWindowPreferences } from "./secondaryWindowPreferences"

/** Entry for the supervision pop-out window (SPEC-2026-10-19-supervision-popout-v1). */
export function renderElectronSupervisionApp(apis: RuntimeAPIs) {
  const localeReady = initializeSecondaryWindowPreferences("supervision-main")

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
              <MotionConfig reducedMotion="user">
                <SessionAuthGate>
                  <ElectronSupervisionApp apis={apis} />
                </SessionAuthGate>
              </MotionConfig>
            </ThemeProvider>
          </ThemeSystemProvider>
        </I18nProvider>
      </StrictMode>,
    ),
  )
}
