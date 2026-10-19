import * as React from "react"
import { Icon } from "@/components/icon/Icon"
import { toast } from "@/components/ui/toast"
import { reloadAxCodeConfiguration } from "@/stores/useAgentsStore"
import { useUIStore } from "@/stores/useUIStore"
import { useI18n } from "@/lib/i18n"
import { getSafeStorage } from "@/stores/utils/safeStorage"
import { API_ENDPOINTS } from "@/lib/http"
import {
  resolveAxCodeIncompatibility,
  resolveAxCodeUpdateVersion,
  resolveAxCodeUpgradeStatusVersion,
  shouldShowAxCodeUpdateToast,
  type AxCodeUpgradeStatusLike,
} from "./axCodeUpdateDedup"
import {
  fetchAxCodeCliStatus,
  resolveAxCodeCliUpdateVersion,
  startAxCodeCliUpgrade,
  waitForAxCodeCliUpgrade,
  type AxCodeCliStatus,
} from "./axCodeCliStatus"

const UPDATE_TOAST_ID = "ax-code-update-available"
const UPGRADE_TOAST_ID = "ax-code-upgrade-progress"
const INCOMPATIBLE_TOAST_ID = "ax-code-incompatible-version"
const INITIAL_CHECK_DELAY_MS = 5_000
const CHECK_RETRY_DELAYS_MS = [10_000, 60_000]
const UPDATE_TOAST_DISMISSED_VERSION_KEY = "ax-code-update-toast-dismissed-version"
const CLI_UPDATE_TOAST_ID = "ax-code-cli-update-available"
const CLI_UPGRADE_TOAST_ID = "ax-code-cli-upgrade-progress"
const CLI_UPDATE_TOAST_DISMISSED_VERSION_KEY = "ax-code-cli-update-toast-dismissed-version"
const CLI_INITIAL_CHECK_DELAY_MS = 8_000
const CLI_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export const AxCodeUpdateToast: React.FC = () => {
  const { t } = useI18n()
  const showAxCodeUpdateNotifications = useUIStore((state) => state.showAxCodeUpdateNotifications)
  const seenVersionsRef = React.useRef(new Set<string>())
  const upgradingRef = React.useRef(false)
  const warnedIncompatibleVersionRef = React.useRef<string | null>(null)
  const cliSeenVersionsRef = React.useRef(new Set<string>())
  const cliUpgradingRef = React.useRef(false)
  const cliStatusRef = React.useRef<AxCodeCliStatus | null>(null)
  const mountedRef = React.useRef(true)
  // The runtime check fires before the first CLI status check on startup. The
  // announcement waits on this promise so the dedup guard below can see the
  // status instead of the initial `null`; a failed check still settles it so
  // an update is not lost while the status is unknown.
  const [cliInitialCheck] = React.useState(() => {
    let resolve!: () => void
    const promise = new Promise<void>((settle) => {
      resolve = settle
    })
    return { promise, resolve }
  })

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  React.useEffect(() => {
    if (!showAxCodeUpdateNotifications) {
      toast.dismiss(UPDATE_TOAST_ID)
      toast.dismiss(CLI_UPDATE_TOAST_ID)
    }
  }, [showAxCodeUpdateNotifications])

  const reloadAxCode = React.useCallback(() => {
    toast.dismiss(UPGRADE_TOAST_ID)
    toast.dismiss(CLI_UPGRADE_TOAST_ID)
    void reloadAxCodeConfiguration({
      message: t("axCodeUpdate.toast.reload.message"),
      mode: "projects",
      scopes: ["all"],
    })
  }, [t])

  // The standalone `ax-code` CLI/TUI in the user's terminal: a separate
  // install that app updates never touch.
  const runCliUpgrade = React.useCallback(async () => {
    if (cliUpgradingRef.current) return
    cliUpgradingRef.current = true
    toast.dismiss(CLI_UPDATE_TOAST_ID)
    toast.message(t("axCodeUpdate.cli.toast.upgrading.title"), {
      id: CLI_UPGRADE_TOAST_ID,
      description: t("axCodeUpdate.cli.toast.upgrading.description"),
      duration: Infinity,
      icon: <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />,
    })
    const fail = (command: string | null | undefined) =>
      toast.error(t("axCodeUpdate.cli.toast.failed.title"), {
        id: CLI_UPGRADE_TOAST_ID,
        description: command
          ? t("axCodeUpdate.cli.toast.failed.description", { command })
          : t("axCodeUpdate.cli.toast.failed.descriptionNoCommand"),
        duration: Infinity,
      })
    try {
      const started = await startAxCodeCliUpgrade()
      if (!started.accepted && started.reason !== "already-running") {
        if (started.reason === "up-to-date") {
          toast.dismiss(CLI_UPGRADE_TOAST_ID)
          return
        }
        fail(started.cli?.manualCommand ?? cliStatusRef.current?.manualCommand)
        return
      }
      const settled = await waitForAxCodeCliUpgrade({ isCancelled: () => !mountedRef.current })
      // Cancelled by unmount: the upgrade keeps running on the server, and this
      // toast is gone, so there is nothing left to report to.
      if (!mountedRef.current) return
      const job = settled?.upgrade
      if (settled) cliStatusRef.current = settled
      // The job vanished (the server restarted) but the CLI is now current.
      if (!job && settled?.updateAvailable === false) {
        toast.success(t("axCodeUpdate.cli.toast.updated.title"), {
          id: CLI_UPGRADE_TOAST_ID,
          description: t("axCodeUpdate.cli.toast.updated.description", { version: settled.currentVersion ?? "" }),
          duration: 8_000,
          icon: <Icon name="check" className="h-4 w-4 text-[var(--status-success)]" />,
        })
        return
      }
      if (job?.state === "succeeded" && job.runtimeRestartFailed) {
        toast.warning(t("axCodeUpdate.cli.toast.updated.title"), {
          id: CLI_UPGRADE_TOAST_ID,
          description: t("axCodeUpdate.cli.toast.updated.restartFailed", { version: job.version ?? "" }),
          duration: Infinity,
          action: {
            label: t("axCodeUpdate.toast.actions.reload"),
            onClick: reloadAxCode,
          },
        })
        return
      }
      if (job?.state === "succeeded") {
        toast.success(t("axCodeUpdate.cli.toast.updated.title"), {
          id: CLI_UPGRADE_TOAST_ID,
          description: job.shadowedBy?.path
            ? t("axCodeUpdate.cli.toast.updated.shadowed", {
                version: job.version ?? "",
                path: job.shadowedBy.path,
              })
            : t("axCodeUpdate.cli.toast.updated.description", { version: job.version ?? "" }),
          duration: job.shadowedBy?.path ? Infinity : 8_000,
          icon: <Icon name="check" className="h-4 w-4 text-[var(--status-success)]" />,
        })
        return
      }
      fail(settled?.manualCommand ?? cliStatusRef.current?.manualCommand)
    } catch {
      fail(cliStatusRef.current?.manualCommand)
    } finally {
      cliUpgradingRef.current = false
    }
  }, [reloadAxCode, t])

  const runUpgrade = React.useCallback(async () => {
    if (upgradingRef.current) return
    upgradingRef.current = true
    toast.dismiss(UPDATE_TOAST_ID)
    toast.message(t("axCodeUpdate.toast.upgrading.title"), {
      id: UPGRADE_TOAST_ID,
      description: t("axCodeUpdate.toast.upgrading.description"),
      duration: Infinity,
      icon: <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />,
    })

    try {
      const response = await fetch(API_ENDPOINTS.axCode.upgrade, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      })
      const payload = (await response.json().catch(() => null)) as null | {
        success?: boolean
        version?: string
        error?: string
      }
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || response.statusText || t("axCodeUpdate.toast.failed.description"))
      }

      warnedIncompatibleVersionRef.current = null
      toast.dismiss(INCOMPATIBLE_TOAST_ID)
      toast.success(t("axCodeUpdate.toast.updated.title"), {
        id: UPGRADE_TOAST_ID,
        description: payload?.version
          ? t("axCodeUpdate.toast.updated.descriptionWithVersion", { version: payload.version })
          : t("axCodeUpdate.toast.updated.description"),
        duration: Infinity,
        icon: <Icon name="check" className="h-4 w-4 text-[var(--status-success)]" />,
        action: {
          label: t("axCodeUpdate.toast.actions.reload"),
          onClick: reloadAxCode,
        },
      })
    } catch (error) {
      toast.error(t("axCodeUpdate.toast.failed.title"), {
        id: UPGRADE_TOAST_ID,
        description: error instanceof Error ? error.message : t("axCodeUpdate.toast.failed.description"),
        duration: Infinity,
      })
    } finally {
      upgradingRef.current = false
    }
  }, [reloadAxCode, t])

  React.useEffect(() => {
    const showUpdateAvailableToast = async (version: string) => {
      // Upstream setting wins over our dedup logic: if user disabled
      // ax-code update notifications, dismiss any active toast and bail
      // before consulting dedup state.
      if (!useUIStore.getState().showAxCodeUpdateNotifications) {
        toast.dismiss(UPDATE_TOAST_ID)
        return
      }
      await cliInitialCheck.promise
      if (!mountedRef.current) return
      // The wait can outlive the setting: read it again after the CLI check and
      // let the effect cleanup cancel a pending announcement, so disabling
      // notifications mid-wait (or before the check settles) never shows a
      // duration-Infinity toast later.
      if (cancelled) return
      if (!useUIStore.getState().showAxCodeUpdateNotifications) {
        toast.dismiss(UPDATE_TOAST_ID)
        return
      }
      // When Desktop's runtime is the user's own CLI, the CLI toast offers
      // the update for that binary; two toasts would start two upgrades. Only
      // skip it when that toast can stand in: an off-PATH install, or a CLI too
      // old to check, gets no CLI toast and would lose the notification.
      if (cliStatusRef.current?.isRuntimeBinary && resolveAxCodeCliUpdateVersion(cliStatusRef.current)) return
      const decision = shouldShowAxCodeUpdateToast({
        version,
        dismissedVersion: getSafeStorage().getItem(UPDATE_TOAST_DISMISSED_VERSION_KEY),
        seenVersions: seenVersionsRef.current,
      })
      if (!decision) {
        return
      }
      seenVersionsRef.current.add(version)

      toast.info(t("axCodeUpdate.toast.available.title"), {
        id: UPDATE_TOAST_ID,
        description: t("axCodeUpdate.toast.available.description", { version }),
        duration: Infinity,
        action: {
          label: t("axCodeUpdate.toast.actions.update"),
          onClick: runUpgrade,
        },
        cancel: {
          label: t("axCodeUpdate.toast.actions.dismiss"),
          onClick: () => {
            getSafeStorage().setItem(UPDATE_TOAST_DISMISSED_VERSION_KEY, version)
            toast.dismiss(UPDATE_TOAST_ID)
          },
        },
      })
    }

    const onUpdateAvailable = (event: Event) => {
      const version = resolveAxCodeUpdateVersion((event as CustomEvent<unknown>).detail)
      void showUpdateAvailableToast(version)
    }

    let cancelled = false
    const timeoutIds: Array<ReturnType<typeof setTimeout>> = []

    // The incompatibility warning is an error condition, not a notification:
    // it shows regardless of the update-notification preference.
    const showIncompatibleToast = (incompatibility: { version: string; minSupportedVersion: string }) => {
      if (warnedIncompatibleVersionRef.current === incompatibility.version) {
        return
      }
      warnedIncompatibleVersionRef.current = incompatibility.version

      toast.warning(t("axCodeUpdate.toast.incompatible.title"), {
        id: INCOMPATIBLE_TOAST_ID,
        description: t("axCodeUpdate.toast.incompatible.description", {
          version: incompatibility.version,
          minVersion: incompatibility.minSupportedVersion,
        }),
        duration: Infinity,
        action: {
          label: t("axCodeUpdate.toast.actions.update"),
          onClick: runUpgrade,
        },
      })
    }

    const checkForUpdate = async (attempt: number) => {
      try {
        const response = await fetch(API_ENDPOINTS.axCode.upgradeStatus, { headers: { Accept: "application/json" } })
        if (!response.ok) throw new Error(response.statusText || "ax-code upgrade status check failed")
        const status = (await response.json().catch(() => null)) as AxCodeUpgradeStatusLike | null
        if (cancelled) return

        const incompatibility = resolveAxCodeIncompatibility(status)
        if (incompatibility) {
          showIncompatibleToast(incompatibility)
        }

        // Bundled runtimes are pinned to the app version and replaced by app
        // updates; the self-upgrade action does not apply to them.
        const bundled = status?.binarySource === "bundled"
        const version = bundled ? "" : resolveAxCodeUpgradeStatusVersion(status)
        if (version) {
          void showUpdateAvailableToast(version)
        }
      } catch {
        const delay = CHECK_RETRY_DELAYS_MS[attempt]
        if (!cancelled && delay !== undefined) {
          timeoutIds.push(
            setTimeout(() => {
              void checkForUpdate(attempt + 1)
            }, delay),
          )
        }
      }
    }

    timeoutIds.push(
      setTimeout(() => {
        void checkForUpdate(0)
      }, INITIAL_CHECK_DELAY_MS),
    )

    window.addEventListener("openchamber:ax-code-update-available", onUpdateAvailable)
    return () => {
      cancelled = true
      for (const timeoutId of timeoutIds) clearTimeout(timeoutId)
      window.removeEventListener("openchamber:ax-code-update-available", onUpdateAvailable)
    }
  }, [cliInitialCheck, runUpgrade, showAxCodeUpdateNotifications, t])

  React.useEffect(() => {
    if (!showAxCodeUpdateNotifications) return
    let cancelled = false
    const timeoutIds: Array<ReturnType<typeof setTimeout>> = []

    const showCliToast = (status: AxCodeCliStatus) => {
      const version = resolveAxCodeCliUpdateVersion(status)
      if (!version || !useUIStore.getState().showAxCodeUpdateNotifications) return
      const decision = shouldShowAxCodeUpdateToast({
        version,
        dismissedVersion: getSafeStorage().getItem(CLI_UPDATE_TOAST_DISMISSED_VERSION_KEY),
        seenVersions: cliSeenVersionsRef.current,
      })
      if (!decision) return
      cliSeenVersionsRef.current.add(version)
      if (status.isRuntimeBinary) toast.dismiss(UPDATE_TOAST_ID)
      const description = status.canUpgrade
        ? t("axCodeUpdate.cli.toast.available.description", { version, path: status.path ?? "ax-code" })
        : status.manualCommand
          ? t("axCodeUpdate.cli.toast.available.manual", { version, command: status.manualCommand })
          : t("axCodeUpdate.cli.toast.available.descriptionNoAction", { version })
      toast.info(t("axCodeUpdate.cli.toast.available.title"), {
        id: CLI_UPDATE_TOAST_ID,
        description,
        duration: Infinity,
        action: status.canUpgrade
          ? {
              label: t("axCodeUpdate.toast.actions.update"),
              onClick: () => void runCliUpgrade(),
            }
          : undefined,
        cancel: {
          label: t("axCodeUpdate.toast.actions.dismiss"),
          onClick: () => {
            getSafeStorage().setItem(CLI_UPDATE_TOAST_DISMISSED_VERSION_KEY, version)
            toast.dismiss(CLI_UPDATE_TOAST_ID)
          },
        },
      })
    }

    const checkCli = async (attempt: number) => {
      // Re-checks wait for a visible window; the server caches results.
      if (attempt > 0 && typeof document !== "undefined" && document.visibilityState === "hidden") {
        timeoutIds.push(setTimeout(() => void checkCli(attempt), 60_000))
        return
      }
      try {
        const status = await fetchAxCodeCliStatus({ check: true })
        if (cancelled) return
        cliStatusRef.current = status
        if (attempt === 0) cliInitialCheck.resolve()
        showCliToast(status)
        timeoutIds.push(setTimeout(() => void checkCli(1), CLI_RECHECK_INTERVAL_MS))
      } catch {
        const delay = CHECK_RETRY_DELAYS_MS[attempt]
        if (!cancelled) {
          if (attempt === 0) cliInitialCheck.resolve()
          timeoutIds.push(setTimeout(() => void checkCli(attempt + 1), delay ?? CLI_RECHECK_INTERVAL_MS))
        }
      }
    }

    timeoutIds.push(setTimeout(() => void checkCli(0), CLI_INITIAL_CHECK_DELAY_MS))
    return () => {
      cancelled = true
      for (const timeoutId of timeoutIds) clearTimeout(timeoutId)
    }
  }, [cliInitialCheck, runCliUpgrade, showAxCodeUpdateNotifications, t])

  return null
}
