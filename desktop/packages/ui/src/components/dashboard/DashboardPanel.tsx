import React from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { API_ENDPOINTS } from "@/lib/http"
import { normalizeProjectPath } from "@/lib/projectResolution"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useSessions } from "@/sync/sync-context"
import { buildDashboardUrl } from "./dashboardUrl"

type DashboardPanelProps = {
  directory: string
}

const VERSION_TIMEOUT_MS = 10_000

interface VersionRead {
  refresh: number
  version: string | null
}

async function readRuntimeVersion(signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(API_ENDPOINTS.axCode.upgradeStatus, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as { currentVersion?: unknown } | null
    return typeof data?.currentVersion === "string" ? data.currentVersion : null
  } catch {
    return null
  }
}

const getDesktopServerOrigin = (): string => {
  if (typeof window === "undefined") return ""

  return (
    window.__AX_CODE_DESKTOP_DESKTOP_SERVER__?.origin ||
    window.__AX_CODE_DESKTOP_LOCAL_ORIGIN__ ||
    window.location.origin
  )
}

const getSessionDirectory = (session: unknown): string => {
  const directory = (session as { directory?: unknown } | null)?.directory
  return typeof directory === "string" ? directory : ""
}

const isSameDirectory = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeProjectPath(left)
  const normalizedRight = normalizeProjectPath(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ directory }) => {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const sessions = useSessions()
  const [refresh, setRefresh] = React.useState(0)
  const [versionRead, setVersionRead] = React.useState<VersionRead | null>(null)
  const dashboardOrigin = React.useMemo(() => getDesktopServerOrigin(), [])

  React.useEffect(() => {
    const controller = new AbortController()
    // Bound the entire read, including JSON parsing and adapters that ignore abort.
    const timeout = setTimeout(() => {
      controller.abort()
      setVersionRead({ refresh, version: null })
    }, VERSION_TIMEOUT_MS)
    void readRuntimeVersion(controller.signal).then((version) => {
      if (controller.signal.aborted) return
      clearTimeout(timeout)
      setVersionRead({ refresh, version })
    })
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [refresh])

  const currentSession = React.useMemo(() => {
    if (!currentSessionId) return null
    return sessions.find((session) => session.id === currentSessionId) ?? null
  }, [currentSessionId, sessions])

  const dashboardSession = React.useMemo(() => {
    if (!currentSession || !isSameDirectory(getSessionDirectory(currentSession), directory)) {
      return null
    }
    return currentSession
  }, [currentSession, directory])

  const dashboardUrl = versionRead?.refresh === refresh
    ? buildDashboardUrl(dashboardSession?.id ?? null, directory, dashboardOrigin, versionRead.version)
    : ""

  const title = dashboardSession?.title?.trim() || (dashboardSession ? "Session Dashboard" : "Project Dashboard")
  const subtitle = dashboardSession
    ? "Live DRE dashboard for the selected session."
    : "Select a session for detailed DRE evidence, or use the project dashboard index."

  if (!directory) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6 text-center text-muted-foreground">
        Open a project to use Dashboard.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/40 bg-[var(--surface-background)] px-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon name="bar-chart-box" className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate typography-ui-label">{title}</div>
            <div className="hidden truncate typography-micro text-muted-foreground sm:block">{subtitle}</div>
          </div>
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="gap-1"
          onClick={() => setRefresh((key) => key + 1)}
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="gap-1"
          disabled={!dashboardUrl}
          onClick={() => {
            if (!dashboardUrl) return
            window.open(dashboardUrl, "_blank", "noopener,noreferrer")
          }}
        >
          <Icon name="external-link" className="h-3.5 w-3.5" />
          Open
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-[var(--surface-background)]">
        {dashboardUrl ? (
          <iframe
            src={dashboardUrl}
            title={title}
            className="h-full w-full border-0 bg-background"
            sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          />
        ) : null}
      </div>
    </div>
  )
}

