import { compareAxCodeVersions } from "../../../../../shared/ax-code-version.mjs"

/** First ax-code release that serves the dashboard at `/run-report` instead of `/dre-graph`. */
const RUN_REPORT_MIN_RUNTIME_VERSION = "7.24.1"

/** Older and unknown runtimes use the legacy dashboard route. */
export const dashboardReportRoot = (runtimeVersion: string | null | undefined): "/run-report" | "/dre-graph" => {
  const order = compareAxCodeVersions(runtimeVersion, RUN_REPORT_MIN_RUNTIME_VERSION)
  return order !== null && order >= 0 ? "/run-report" : "/dre-graph"
}

export const buildDashboardUrl = (
  sessionId: string | null,
  directory: string,
  origin: string,
  runtimeVersion: string | null | undefined,
): string => {
  const normalizedOrigin = origin.replace(/\/+$/, "")
  const withOrigin = (path: string): string => (normalizedOrigin ? `${normalizedOrigin}${path}` : path)
  const params = new URLSearchParams()
  if (directory) params.set("directory", directory)
  const query = params.toString()
  const root = dashboardReportRoot(runtimeVersion)
  const path = sessionId ? `${root}/session/${encodeURIComponent(sessionId)}` : root
  return withOrigin(query ? `${path}?${query}` : path)
}
