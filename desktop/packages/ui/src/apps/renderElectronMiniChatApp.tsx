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
import { ElectronMiniChatApp } from "./ElectronMiniChatApp"
import { initializeSecondaryWindowPreferences } from "./secondaryWindowPreferences"

export function renderElectronMiniChatApp(apis: RuntimeAPIs) {
  const localeReady = initializeSecondaryWindowPreferences("mini-chat-main")

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
