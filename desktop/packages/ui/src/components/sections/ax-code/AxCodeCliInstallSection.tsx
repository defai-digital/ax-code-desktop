import * as React from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { API_ENDPOINTS } from "@/lib/http"
import {
  fetchAxCodeCliStatus,
  startAxCodeCliUpgrade,
  waitForAxCodeCliUpgrade,
  type AxCodeCliStatus,
  type AxCodeCliUpgradeJob,
} from "@/components/update/axCodeCliStatus"

interface RuntimeInfo {
  readonly version: string | null
  readonly source: string | null
}

type Translate = ReturnType<typeof useI18n>["t"]

const OUTCOME_FRESH_MS = 10 * 60_000

const describeOutcome = (job: AxCodeCliUpgradeJob, status: AxCodeCliStatus, t: Translate): { tone: "success" | "warning" | "error"; text: string } | null => {
  if (job.state === "succeeded") {
    if (job.runtimeRestartFailed) {
      return {
        tone: "warning",
        text: t("settings.openchamber.axCodeCli.install.result.restartFailed", { version: job.version ?? "" }),
      }
    }
    if (job.shadowedBy?.path) {
      return {
        tone: "warning",
        text: t("settings.openchamber.axCodeCli.install.result.shadowed", {
          version: job.version ?? "",
          path: job.shadowedBy.path,
          activeVersion: job.shadowedBy.version ?? "?",
        }),
      }
    }
    return { tone: "success", text: t("settings.openchamber.axCodeCli.install.result.updated", { version: job.version ?? "" }) }
  }
  if (job.state === "failed") {
    return {
      tone: "error",
      text: status.manualCommand
        ? t("settings.openchamber.axCodeCli.install.result.failed", { command: status.manualCommand })
        : t("settings.openchamber.axCodeCli.install.result.failedNoCommand"),
    }
  }
  return null
}

/**
 * The `ax-code` command in the user's terminal, which is installed and updated
 * separately from Desktop's own runtime.
 */
export const AxCodeCliInstallSection: React.FC = () => {
  const { t } = useI18n()
  const [status, setStatus] = React.useState<AxCodeCliStatus | null>(null)
  const [runtime, setRuntime] = React.useState<RuntimeInfo | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const mountedRef = React.useRef(true)
  // An upgrade outcome is news only if this view saw it run or it is recent;
  // otherwise an old result would sit under every later status.
  const sawRunningRef = React.useRef(false)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const followUpgrade = React.useCallback(async () => {
    sawRunningRef.current = true
    while (mountedRef.current) {
      const settled = await waitForAxCodeCliUpgrade({ isCancelled: () => !mountedRef.current })
      if (!mountedRef.current) return
      if (settled) {
        setStatus(settled)
        setLoadFailed(false)
        return
      }
      // If connectivity returns while the installer is still running, keep
      // following it rather than leaving the controls disabled indefinitely.
      try {
        const next = await fetchAxCodeCliStatus()
        if (!mountedRef.current) return
        setStatus(next)
        setLoadFailed(false)
        if (next.upgrade?.state === "running") continue
      } catch {
        if (mountedRef.current) {
          setStatus((current) => (current ? { ...current, upgrade: null } : current))
          setLoadFailed(true)
        }
      }
      return
    }
  }, [])

  const load = React.useCallback(
    async (refresh: boolean) => {
      setChecking(true)
      setNotice(null)
      try {
        const next = await fetchAxCodeCliStatus({ refresh, check: true })
        if (!mountedRef.current) return
        setStatus(next)
        setLoadFailed(false)
        if (next.upgrade?.state === "running") void followUpgrade()
      } catch {
        if (mountedRef.current) setLoadFailed(true)
      } finally {
        if (mountedRef.current) setChecking(false)
      }
    },
    [followUpgrade],
  )

  React.useEffect(() => {
    void load(false)
    void (async () => {
      try {
        const response = await fetch(API_ENDPOINTS.axCode.upgradeStatus, { headers: { Accept: "application/json" } })
        const payload = (await response.json().catch(() => null)) as null | {
          currentVersion?: unknown
          binarySource?: unknown
        }
        if (!mountedRef.current || !payload) return
        setRuntime({
          version: typeof payload.currentVersion === "string" ? payload.currentVersion : null,
          source: typeof payload.binarySource === "string" ? payload.binarySource : null,
        })
      } catch {
        // The runtime line is informational only.
      }
    })()
  }, [load])

  const handleUpgrade = React.useCallback(async () => {
    setNotice(null)
    try {
      const started = await startAxCodeCliUpgrade()
      if (!mountedRef.current) return
      if (!started.accepted) {
        if (started.cli) setStatus(started.cli)
        if (started.reason === "already-running") {
          void load(false)
        } else if (started.reason === "up-to-date") {
          setNotice(t("settings.openchamber.axCodeCli.install.status.upToDate"))
        } else {
          const command = started.cli?.manualCommand ?? status?.manualCommand
          setNotice(
            command
              ? t("settings.openchamber.axCodeCli.install.manual", { command })
              : t("settings.openchamber.axCodeCli.install.blocked.unknownMethod"),
          )
        }
        return
      }
      setStatus((current) => (current && started.upgrade ? { ...current, upgrade: started.upgrade } : current))
      void followUpgrade()
    } catch {
      if (mountedRef.current) {
        setNotice(
          status?.manualCommand
            ? t("settings.openchamber.axCodeCli.install.result.failed", { command: status.manualCommand })
            : t("settings.openchamber.axCodeCli.install.result.failedNoCommand"),
        )
      }
    }
  }, [followUpgrade, load, status?.manualCommand, t])

  const upgrading = status?.upgrade?.state === "running"
  const outcomeIsNews = (() => {
    const job = status?.upgrade
    if (!job || job.state === "running") return false
    if (sawRunningRef.current) return true
    const finishedAt = job.finishedAt ? Date.parse(job.finishedAt) : NaN
    return Number.isFinite(finishedAt) && Date.now() - finishedAt < OUTCOME_FRESH_MS
  })()
  const outcome = status?.upgrade && outcomeIsNews ? describeOutcome(status.upgrade, status, t) : null

  const runtimeLine = (() => {
    if (!runtime && !status) return null
    if ((status?.runtimeSource ?? runtime?.source) === "bundled") {
      return t("settings.openchamber.axCodeCli.install.runtime.bundled", { version: runtime?.version ?? "?" })
    }
    if (status?.isRuntimeBinary) return t("settings.openchamber.axCodeCli.install.runtime.same")
    return runtime?.version ? t("settings.openchamber.axCodeCli.install.runtime.other", { version: runtime.version }) : null
  })()

  const statusChip = (() => {
    if (!status) return null
    if (upgrading) return { tone: "text-muted-foreground", text: t("settings.openchamber.axCodeCli.install.status.updating") }
    if (!status.installed) return { tone: "text-muted-foreground", text: t("settings.openchamber.axCodeCli.install.status.notInstalled") }
    if (status.updateAvailable === true) {
      return {
        tone: "text-[var(--status-warning)]",
        text: t("settings.openchamber.axCodeCli.install.status.updateAvailable", { version: status.latestVersion ?? "" }),
      }
    }
    if (status.updateAvailable === false) return { tone: "text-[var(--status-success)]", text: t("settings.openchamber.axCodeCli.install.status.upToDate") }
    if (status.error) return { tone: "text-[var(--status-error)]", text: t("settings.openchamber.axCodeCli.install.status.checkFailed") }
    return { tone: "text-muted-foreground", text: t("settings.openchamber.axCodeCli.install.status.unknown") }
  })()

  const showUpdateButton = Boolean(status?.installed && status.updateAvailable === true)

  return (
    <div className="mb-8" data-testid="ax-code-cli-install">
      <div className="mb-1 px-1">
        <h3 className="typography-ui-header font-medium text-foreground">
          {t("settings.openchamber.axCodeCli.install.title")}
        </h3>
        <p className="typography-meta text-muted-foreground">{t("settings.openchamber.axCodeCli.install.description")}</p>
        {runtimeLine ? <p className="typography-meta text-muted-foreground">{runtimeLine}</p> : null}
      </div>

      <section className="px-2 pb-2 pt-0 space-y-1" aria-live="polite">
        {loadFailed && !status ? (
          <div className="py-1.5 typography-meta text-[var(--status-error)]">
            {t("settings.openchamber.axCodeCli.install.status.checkFailed")}
          </div>
        ) : null}

        {status?.installed ? (
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 py-1.5 typography-meta">
            <dt className="text-muted-foreground">{t("settings.openchamber.axCodeCli.install.field.path")}</dt>
            <dd className="min-w-0 text-foreground">
              <span className="block truncate font-mono" title={status.path ?? undefined}>
                {status.path}
              </span>
              {!status.onPath ? (
                <span className="block text-muted-foreground">{t("settings.openchamber.axCodeCli.install.offPath")}</span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">{t("settings.openchamber.axCodeCli.install.field.version")}</dt>
            <dd className="text-foreground">{status.currentVersion ?? "?"}</dd>
            {status.latestVersion ? (
              <>
                <dt className="text-muted-foreground">{t("settings.openchamber.axCodeCli.install.field.latest")}</dt>
                <dd className="text-foreground">{status.latestVersion}</dd>
              </>
            ) : null}
            {statusChip ? (
              <>
                <dt className="text-muted-foreground">{t("settings.openchamber.axCodeCli.install.field.status")}</dt>
                <dd className={statusChip.tone}>{statusChip.text}</dd>
              </>
            ) : null}
          </dl>
        ) : status ? (
          <div className="py-1.5 typography-meta text-muted-foreground">
            {t("settings.openchamber.axCodeCli.install.status.notInstalledHint")}
          </div>
        ) : null}

        {status?.otherPaths.length ? (
          <div className="py-1 typography-micro text-muted-foreground">
            <div>{t("settings.openchamber.axCodeCli.install.otherInstalls")}</div>
            <ul className="mt-0.5 space-y-0.5">
              {status.otherPaths.map((entry) => (
                <li key={entry} className="truncate font-mono" title={entry}>
                  {entry}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status?.installed && status.updateAvailable !== false && !status.canUpgrade ? (
          <div className="py-1 typography-meta text-muted-foreground">
            {status.blockedReason === "runtime-in-use" && status.manualCommand
              ? t("settings.openchamber.axCodeCli.install.blocked.runtimeInUse", { command: status.manualCommand })
              : status.manualCommand
                ? t("settings.openchamber.axCodeCli.install.manual", { command: status.manualCommand })
                : t("settings.openchamber.axCodeCli.install.blocked.unknownMethod")}
          </div>
        ) : null}

        {outcome && !upgrading ? (
          <div
            className={
              outcome.tone === "success"
                ? "py-1 typography-meta text-[var(--status-success)]"
                : outcome.tone === "warning"
                  ? "py-1 typography-meta text-[var(--status-warning)]"
                  : "py-1 typography-meta text-[var(--status-error)]"
            }
          >
            {outcome.text}
          </div>
        ) : null}

        {notice ? <div className="py-1 typography-meta text-muted-foreground">{notice}</div> : null}

        <div className="flex flex-wrap items-center gap-2 py-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void load(true)}
            disabled={checking || upgrading}
            className="shrink-0 !font-normal"
          >
            {checking ? t("settings.openchamber.axCodeCli.install.actions.checking") : t("settings.openchamber.axCodeCli.install.actions.check")}
          </Button>
          {showUpdateButton && status?.canUpgrade ? (
            <Button
              type="button"
              size="xs"
              onClick={() => void handleUpgrade()}
              disabled={checking || upgrading}
              className="shrink-0 !font-normal"
            >
              {upgrading ? (
                <>
                  <Icon name="refresh" className="mr-1 h-3.5 w-3.5 animate-spin" />
                  {t("settings.openchamber.axCodeCli.install.status.updating")}
                </>
              ) : (
                t("settings.openchamber.axCodeCli.install.actions.update", { version: status.latestVersion ?? "" })
              )}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
