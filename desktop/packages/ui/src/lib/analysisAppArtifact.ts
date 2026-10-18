import { normalizeProjectActionDirectory } from "./projectActions"

export type AnalysisAppArtifact = { version: 1; kind: "streamlit"; entrypoint: string }
export const ANALYSIS_APP_RUN_EVENT = "ax-code:analysis-app-run"

/** Presentation data only: no commands, environment, URLs or setup authority. */
export function parseAnalysisAppArtifact(source: string): AnalysisAppArtifact | null {
  if (source.length > 2048) return null
  try {
    const value = JSON.parse(source)
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    if (Object.keys(value).sort().join(",") !== "entrypoint,kind,version") return null
    const path = value.entrypoint
    if (
      value.version !== 1 ||
      value.kind !== "streamlit" ||
      typeof path !== "string" ||
      !path.endsWith(".py") ||
      path.length > 1000 ||
      /[\\:]/.test(path) ||
      Array.from(path).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      path.split("/").some((part: string) => !part || part === "." || part === ".." || part.startsWith("-"))
    )
      return null
    return { version: 1, kind: "streamlit", entrypoint: path }
  } catch {
    return null
  }
}

export type AnalysisAppRunRequest = {
  sessionId: string
  directory: string
  artifact: AnalysisAppArtifact
}

/** A synchronous claim prevents two mounted toolbar variants from executing twice. */
export function claimAnalysisAppRun(
  event: Event,
  currentSessionId: string | null,
  directory: string,
): AnalysisAppRunRequest | null {
  if (event.defaultPrevented || !event.cancelable || !(event instanceof CustomEvent)) return null
  const detail = event.detail as Partial<AnalysisAppRunRequest> | null
  if (!detail || !currentSessionId || detail.sessionId !== currentSessionId || typeof detail.directory !== "string")
    return null
  if (!directory || normalizeProjectActionDirectory(detail.directory) !== normalizeProjectActionDirectory(directory))
    return null
  let artifact: AnalysisAppArtifact | null
  try {
    artifact = parseAnalysisAppArtifact(JSON.stringify(detail.artifact) ?? "")
  } catch {
    return null
  }
  if (!artifact) return null
  event.preventDefault()
  return { sessionId: currentSessionId, directory, artifact }
}

export function requestAnalysisAppRun(request: AnalysisAppRunRequest): boolean {
  return !window.dispatchEvent(new CustomEvent(ANALYSIS_APP_RUN_EVENT, { detail: request, cancelable: true }))
}
