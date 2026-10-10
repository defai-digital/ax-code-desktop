/** First ax-code release that serves the dashboard at `/run-report` instead of `/dre-graph`. */
export const RUN_REPORT_MIN_RUNTIME_VERSION = "7.24.1"

type ParsedRuntimeVersion = {
  parts: number[]
  prerelease: boolean
}

const normalizeVersionText = (value: string): string => value.trim().replace(/^v/, "").split("+")[0]

const parseRuntimeVersion = (value: string): ParsedRuntimeVersion => {
  const normalized = normalizeVersionText(value)
  const prereleaseIndex = normalized.indexOf("-")
  const core = prereleaseIndex >= 0 ? normalized.slice(0, prereleaseIndex) : normalized
  const suffix = prereleaseIndex >= 0 ? normalized.slice(prereleaseIndex + 1) : ""
  const prerelease = /^(alpha|beta|rc|pre|preview|next)(?:[.-]|\d|$)/i.test(suffix)
  const parts = core.split(".").map((part) => {
    const parsed = Number.parseInt(part || "0", 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  return { parts, prerelease }
}

const compareRuntimeVersions = (left: string, right: string): number => {
  const a = parseRuntimeVersion(left)
  const b = parseRuntimeVersion(right)
  const length = Math.max(a.parts.length, b.parts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a.parts[index] || 0) - (b.parts[index] || 0)
    if (diff !== 0) return diff
  }
  if (a.prerelease !== b.prerelease) return a.prerelease ? -1 : 1
  return 0
}

/** Current runtimes serve `/run-report`. The pinned 7.10.2 runtime, and any unknown version, still serve `/dre-graph`. */
export const dashboardReportRoot = (runtimeVersion: string | null | undefined): "/run-report" | "/dre-graph" => {
  const version = typeof runtimeVersion === "string" ? runtimeVersion.trim() : ""
  if (!version) return "/dre-graph"
  return compareRuntimeVersions(version, RUN_REPORT_MIN_RUNTIME_VERSION) >= 0 ? "/run-report" : "/dre-graph"
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
