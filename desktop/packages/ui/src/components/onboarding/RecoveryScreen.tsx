import React from "react"
import { isTauriShell, restartDesktopApp } from "@/lib/desktop"
import { DesktopConnectionRecovery, type RecoveryVariant } from "./DesktopConnectionRecovery"
import { resolveRecoveryNextStep } from "./desktopRecoveryRouting"
import { desktopHostsGet, desktopHostsSet } from "@/lib/desktopHosts"
import { API_ENDPOINTS } from "@/lib/http"
import { DesktopTitlebarDragStrip } from "@/components/layout/DesktopTitlebarDragStrip"
import { toast } from "@/components/ui"
import { useI18n } from "@/lib/i18n"

type RecoveryScreenProps = {
  /** Recovery variant */
  variant: RecoveryVariant
  /** Host URL for recovery context */
  hostUrl?: string
  /** Host label for recovery context */
  hostLabel?: string
  /** Callback when user wants to retry */
  onRetry?: () => void
  /** Callback when entering local setup */
  onEnterLocalSetup?: () => void
  /** Whether retry action is in progress */
  isRetrying?: boolean
}

export function RecoveryScreen({
  variant,
  hostUrl,
  hostLabel,
  onRetry,
  onEnterLocalSetup,
  isRetrying = false,
}: RecoveryScreenProps) {
  const { t } = useI18n()
  // Both actions below end in a write or a restart that can reject — a Tauri invoke that fails, or a
  // reload request against the server that is already unreachable, which is what put the user on this
  // screen. Without these the click did nothing at all and the rejection escaped the handler: the
  // sibling screens carry the same fix for the same class of failure.
  const reportActionFailure = React.useCallback(
    (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t("onboarding.desktopRecovery.error.actionFailed"))
    },
    [t],
  )

  // Keep the compatibility write local-only for older desktop shells.
  const persistLocalChoice = React.useCallback(async () => {
    if (!isTauriShell()) return

    const config = await desktopHostsGet()
    await desktopHostsSet({
      ...config,
      hosts: [],
      defaultHostId: "local",
      initialHostChoiceCompleted: true,
    })
  }, [])

  const handleRecoveryRetry = React.useCallback(async () => {
    try {
      // In desktop boot flow, always restart the entire Tauri app so Rust
      // can re-evaluate the boot outcome.
      if (isTauriShell()) {
        if (!(await restartDesktopApp())) {
          reportActionFailure(new Error(t("onboarding.desktopRecovery.error.actionFailed")))
        }
        return
      }

      await fetch(API_ENDPOINTS.config.reload, { method: "POST" })
      onRetry?.()
    } catch (error) {
      reportActionFailure(error)
    }
  }, [onRetry, reportActionFailure, t])

  const handleRecoveryUseLocal = React.useCallback(async () => {
    const step = resolveRecoveryNextStep(variant, "use-local")
    if (step.kind === "local-setup") {
      // local-unavailable + local → enter local-setup subflow without reload
      onEnterLocalSetup?.()
      return
    }
    // switch-default-to-local → persist local choice and restart
    try {
      await persistLocalChoice()

      if (isTauriShell()) {
        if (!(await restartDesktopApp())) {
          reportActionFailure(new Error(t("onboarding.desktopRecovery.error.actionFailed")))
        }
        return
      }

      window.location.reload()
    } catch (error) {
      reportActionFailure(error)
    }
  }, [variant, persistLocalChoice, onEnterLocalSetup, reportActionFailure, t])

  return (
    <>
      <DesktopTitlebarDragStrip />
      <DesktopConnectionRecovery
        variant={variant}
        hostLabel={hostLabel}
        hostUrl={hostUrl}
        onRetry={handleRecoveryRetry}
        onUseLocal={handleRecoveryUseLocal}
        isRetrying={isRetrying}
      />
    </>
  )
}
