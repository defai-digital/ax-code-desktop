import type { RenderOptions } from "beautiful-mermaid"
import capabilities from "./mermaidCapabilities.json"

export { capabilities as mermaidCapabilities }
export type MermaidMode = "svg" | "ascii"
export type MermaidRequest = {
  source: string
  mode: MermaidMode
  colors: RenderOptions
  dark: boolean
}
export type MermaidErrorCode =
  | "unsupported"
  | "asciiUnsupported"
  | "configuration"
  | "limit"
  | "render"
  | "timeout"
  | "unavailable"
  | "busy"
export class MermaidRenderError extends Error {
  constructor(
    public readonly code: MermaidErrorCode,
    message: string = code,
  ) {
    super(message)
    this.name = "MermaidRenderError"
  }
}

// Source-controlled configuration is intentionally excluded from the host contract.
// It must not override security, resource limits, fonts, or the selected theme.
export function getMermaidCapability(source: string, mode: MermaidMode) {
  if (source.length > capabilities.maxSourceCharacters || source.split("\n").length > capabilities.maxSourceLines) {
    throw new MermaidRenderError("limit")
  }
  if (/%%\s*\{/.test(source) || /^\s*---(?:\r?\n|$)/.test(source)) {
    throw new MermaidRenderError("configuration")
  }
  const header =
    source
      .split(/\r?\n/)
      .find((line) => line.trim() && !line.trim().startsWith("%%"))
      ?.trim() ?? ""
  const type = header.match(/^[\w-]+/)?.[0]
  const capability = capabilities.types.find((entry) => entry.id === type || entry.aliases.includes(type ?? ""))
  if (!capability) throw new MermaidRenderError("unsupported")
  if (mode === "ascii" && !capability.ascii) throw new MermaidRenderError("asciiUnsupported")
  return capability
}

export type MermaidWorkerRequest = { id: number; request: MermaidRequest }
export type MermaidWorkerResponse = {
  id: number
  output?: string
  error?: string
  errorCode?: "render" | "unavailable"
}
