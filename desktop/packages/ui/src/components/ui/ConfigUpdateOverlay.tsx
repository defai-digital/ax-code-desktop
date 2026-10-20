import React from "react"
import { getConfigUpdateSnapshot, subscribeConfigUpdate } from "@/lib/configUpdate"
import { useI18n } from "@/lib/i18n"
import { AxCodeIcon } from "./AxCodeIcon"

const CONFIG_UPDATE_OVERLAY_TIMEOUT_MS = 120_000

export const ConfigUpdateOverlay: React.FC = () => {
  const { t } = useI18n()
  const [{ isUpdating, message, batchId }, setState] = React.useState(() => getConfigUpdateSnapshot())
  const [timedOutBatch, setTimedOutBatch] = React.useState<number | null>(null)
  const [dismissedBatch, setDismissedBatch] = React.useState<number | null>(null)
  const timedOut = timedOutBatch === batchId

  React.useEffect(() => {
    return subscribeConfigUpdate(setState)
  }, [])

  React.useEffect(() => {
    if (!isUpdating) return
    const timer = window.setTimeout(() => setTimedOutBatch(batchId), CONFIG_UPDATE_OVERLAY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [isUpdating, batchId])

  if (!isUpdating || dismissedBatch === batchId) {
    return null
  }

  return (
    <div
      data-config-update-overlay=""
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 px-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-background p-6 text-center shadow-xl">
        <AxCodeIcon width={80} height={80} className="invert dark:invert-0" />
        <div className="space-y-1.5">
          <div className="typography-ui-label font-semibold text-foreground">{t("configUpdate.updating")}</div>
          <div className="typography-ui-label text-muted-foreground">{message}</div>
          {timedOut ? (
            <div className="typography-meta text-[var(--status-error)]">{t("configUpdate.timeoutHint")}</div>
          ) : (
            <div className="typography-meta text-muted-foreground">{t("configUpdate.pendingHint")}</div>
          )}
        </div>
        {timedOut ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 typography-ui-label font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
              onClick={() => window.location.reload()}
            >
              {t("configUpdate.reloadApp")}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 typography-ui-label font-medium text-foreground transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]"
              onClick={() => setDismissedBatch(batchId)}
            >
              {t("configUpdate.dismiss")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
