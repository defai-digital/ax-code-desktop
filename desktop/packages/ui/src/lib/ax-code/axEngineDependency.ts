import type { AxEngineModelsResponse } from "./axEngineModelsApi"

type Dependency = AxEngineModelsResponse["dependency"]

export type AxEngineDependencyView = {
  /** One line for the AX Engine status box. */
  summary: string
  /** Full binary path, for the tooltip. */
  path: string | null
  /** Where the binary came from, in words. */
  sourceLabel: string | null
  /** Runtime warnings, with the internal error-code prefix removed. */
  warnings: string[]
  /** How the user changes this binary when Desktop cannot. */
  updateHint: string | null
}

// Resolution order lives in the runtime (configured > PATH > managed > legacy
// bundled > missing). Desktop only labels what the runtime reports.
const SOURCE_LABELS: Record<string, string> = {
  configured: "Custom path",
  path: "From PATH",
  managed: "Installed by AX Code",
  bundled: "Legacy bundled",
}

// Runtime messages start with a machine code such as "AX_ENGINE_VERSION_UNSUPPORTED:".
const stripErrorCode = (message: string) => message.replace(/^[A-Z][A-Z0-9_]+:\s*/, "").trim()

const UPDATE_HINTS: Record<string, string> = {
  configured:
    "This binary is set in provider.ax-engine.options.binaryPath or AX_ENGINE_BIN and is used ahead of every other copy. Update or change it there.",
  path: "AX Code uses the ax-engine on your PATH ahead of its own copy. Update it the same way you installed it.",
}

export const describeAxEngineDependency = (dependency: Dependency | null | undefined): AxEngineDependencyView => {
  if (!dependency) {
    return { summary: "Checking", path: null, sourceLabel: null, warnings: [], updateHint: null }
  }
  const mode = dependency.mode ?? (dependency.available ? undefined : "missing")
  const sourceLabel = mode ? (SOURCE_LABELS[mode] ?? null) : null
  const warnings = (dependency.warnings ?? []).map(stripErrorCode).filter(Boolean)
  const path = dependency.binaryPath ?? null
  const version = dependency.version ?? dependency.managedVersion

  if (!dependency.available) {
    const blocker = dependency.blockers[0]
    // The missing-binary blocker is several lines of install instructions; the
    // status box shows its first line and the details panel shows the rest.
    const firstLine = blocker ? stripErrorCode(blocker).split("\n")[0] : "Not installed"
    return {
      summary: mode === "configured" && path ? `${firstLine} · ${path}` : firstLine,
      path,
      sourceLabel,
      warnings,
      updateHint: mode === "configured" ? (UPDATE_HINTS.configured ?? null) : null,
    }
  }

  const parts = [version ? `v${version}` : null, sourceLabel].filter(Boolean)
  return {
    summary: parts.length > 0 ? parts.join(" · ") : (path ?? "Available"),
    path,
    sourceLabel,
    warnings,
    // A PATH or configured copy wins over anything AX Code installs, so only
    // its owner can update it. Say so only when the runtime flagged something.
    updateHint: warnings.length > 0 && mode ? (UPDATE_HINTS[mode] ?? null) : null,
  }
}

/**
 * Install is offered only where the runtime reports it can install and the
 * result would be used: nothing resolved, host eligible, local (managed) mode.
 */
export const canOfferAxEngineInstall = (
  data: Pick<AxEngineModelsResponse, "dependency" | "eligibility"> | null | undefined,
  connectionMode: string | null | undefined,
) =>
  Boolean(
    data &&
      connectionMode !== "attach" &&
      !data.dependency.available &&
      data.dependency.installable &&
      data.eligibility.supported,
  )

/** The runtime's own manual-install instructions, shown when Desktop cannot install. */
export const axEngineMissingDetails = (dependency: Dependency | null | undefined) => {
  if (!dependency || dependency.available) return []
  const blocker = dependency.blockers[0]
  if (!blocker) return []
  return stripErrorCode(blocker).split("\n").slice(1).filter(Boolean)
}
