import { MermaidRenderError, mermaidCapabilities, type MermaidRequest } from "./mermaidProtocol"

let sequence = 0

// The caller serializes jobs: Mermaid's initialize/render configuration is global.
// This module and the diagram-specific bundles are loaded only for extended SVG types.
export async function renderOfficialMermaid(request: MermaidRequest, signal: AbortSignal): Promise<string> {
  const { default: mermaid } = await import("mermaid")
  signal.throwIfAborted()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    maxTextSize: mermaidCapabilities.maxSourceCharacters,
    maxEdges: 300,
    theme: request.dark ? "dark" : "default",
    themeVariables: {
      background: request.colors.bg ?? (request.dark ? "#18181b" : "#ffffff"),
      textColor: request.colors.fg ?? (request.dark ? "#fafafa" : "#27272a"),
      pieTitleTextColor: request.colors.fg ?? (request.dark ? "#fafafa" : "#27272a"),
      pieLegendTextColor: request.colors.fg ?? (request.dark ? "#fafafa" : "#27272a"),
      pieSectionTextColor: request.dark ? "#111827" : "#ffffff",
      // Mermaid's default dark pie palette is nearly black. Keep categories and
      // their percentage labels distinguishable on the desktop's dark surfaces.
      ...Object.fromEntries(
        (request.dark
          ? [
              "#60a5fa",
              "#34d399",
              "#fbbf24",
              "#c084fc",
              "#fb7185",
              "#22d3ee",
              "#a3e635",
              "#fb923c",
              "#a5b4fc",
              "#f472b6",
              "#2dd4bf",
              "#d4d4d8",
            ]
          : [
              "#2563eb",
              "#047857",
              "#b45309",
              "#7e22ce",
              "#be123c",
              "#0e7490",
              "#4d7c0f",
              "#c2410c",
              "#4338ca",
              "#be185d",
              "#0f766e",
              "#52525b",
            ]
        ).map((color, index) => [`pie${index + 1}`, color]),
      ),
    },
    fontFamily: "Inter, sans-serif",
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  })
  // Validate before creating DOM; parser failures must not leave error SVGs in the page.
  try {
    await mermaid.parse(request.source)
  } catch (error) {
    throw new MermaidRenderError("render", error instanceof Error ? error.message : String(error))
  }
  signal.throwIfAborted()
  const container = document.createElement("div")
  container.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none"
  container.setAttribute("aria-hidden", "true")
  document.body.append(container)
  try {
    const { svg } = await mermaid.render(`ax-mermaid-${++sequence}`, request.source, container)
    signal.throwIfAborted()
    return svg
  } catch (error) {
    if (signal.aborted) throw signal.reason
    throw new MermaidRenderError("render", error instanceof Error ? error.message : String(error))
  } finally {
    container.remove()
  }
}
