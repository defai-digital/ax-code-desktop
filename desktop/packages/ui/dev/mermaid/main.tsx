import React from "react"
import { createRoot } from "react-dom/client"
import { I18nProvider } from "../../src/lib/i18n"
import { getDefaultTheme } from "../../src/lib/theme/themes"
import { MermaidBlock } from "../../src/components/chat/MermaidBlock"
import { mermaidFixtures, largeMermaidFixture } from "../../src/components/chat/mermaid.fixtures"
import { mermaidCapabilities, type MermaidRequest } from "../../src/components/chat/mermaidProtocol"
import { renderMermaidDiagram } from "../../src/components/chat/mermaidRenderer"
import { mermaidSvgToPng } from "../../src/components/chat/mermaidExport"
import "../../src/index.css"

function App() {
  const [source, setSource] = React.useState(mermaidFixtures.pie)
  const [dark, setDark] = React.useState(false)
  const [ascii, setAscii] = React.useState(false)
  const [streaming, setStreaming] = React.useState(false)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [results, setResults] = React.useState<string[]>([])
  const [running, setRunning] = React.useState(false)
  const theme = getDefaultTheme(dark)
  const style = {
    color: theme.colors.surface.foreground,
    background: theme.colors.surface.background,
    "--surface-elevated": theme.colors.surface.elevated,
    "--surface-foreground": theme.colors.surface.foreground,
    "--interactive-border": theme.colors.interactive.border,
  } as React.CSSProperties
  const runMatrix = async () => {
    setRunning(true)
    setResults([])
    const entries: string[] = []
    for (const dark of [false, true]) {
      for (const [type, source] of Object.entries(mermaidFixtures)) {
        const theme = getDefaultTheme(dark)
        const request: MermaidRequest = {
          source,
          mode: "svg",
          dark,
          colors: { bg: theme.colors.surface.elevated, fg: theme.colors.surface.foreground },
        }
        try {
          const start = performance.now()
          const svg = await renderMermaidDiagram(request, new AbortController().signal)
          if (type === "pie" && !svg.includes("\u5b8c\u6210")) throw new Error("Missing CJK pie labels")
          if (type === "flowchart" && !svg.includes("\u958b\u59cb")) throw new Error("Missing CJK flowchart labels")
          const dom = new DOMParser().parseFromString(svg, "image/svg+xml")
          if (![...dom.querySelectorAll("text")].some((text) => text.textContent?.trim()))
            throw new Error("Missing visible SVG labels")
          const png = await mermaidSvgToPng(svg, theme.colors.surface.elevated)
          const bitmap = await createImageBitmap(png)
          const dimensions = `${bitmap.width}x${bitmap.height}`
          const canvas = document.createElement("canvas")
          canvas.width = 64
          canvas.height = 64
          const context = canvas.getContext("2d")!
          context.drawImage(bitmap, 0, 0, 64, 64)
          const pixels = context.getImageData(0, 0, 64, 64).data
          const colors = new Set<string>()
          for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`)
          if (colors.size < 3) throw new Error("PNG has no visible diagram content")
          bitmap.close()
          entries.push(
            `PASS ${type} ${dark ? "dark" : "light"}: SVG labels, PNG ${dimensions}, ${Math.round(performance.now() - start)} ms`,
          )
          if (mermaidCapabilities.types.find((entry) => entry.id === type)?.ascii) {
            const ascii = await renderMermaidDiagram({ ...request, mode: "ascii" }, new AbortController().signal)
            if (!ascii.trim()) throw new Error("Empty ASCII")
            entries.push(`PASS ${type} ASCII ${dark ? "dark" : "light"}`)
          }
        } catch (error) {
          entries.push(`FAIL ${type} ${dark ? "dark" : "light"}: ${String(error)}`)
        }
        setResults([...entries])
      }
    }
    let ticks = 0
    const timer = setInterval(() => ticks++, 10)
    const start = performance.now()
    try {
      await renderMermaidDiagram(
        { source: largeMermaidFixture, mode: "svg", dark: false, colors: {} },
        new AbortController().signal,
      )
      entries.push(
        `PASS large flowchart (181 nodes): ${Math.round(performance.now() - start)} ms, ${ticks} UI timer ticks`,
      )
    } catch (error) {
      entries.push(`FAIL large flowchart: ${String(error)}`)
    }
    clearInterval(timer)
    setResults([...entries])
    setRunning(false)
  }
  return (
    <I18nProvider>
      <main style={{ ...style, minHeight: "100vh", padding: 24 }}>
        <h1 className="mb-4 text-xl">AX Code Mermaid verification</h1>
        <div className="mb-4 flex flex-wrap gap-4">
          <label>
            Diagram{" "}
            <select
              aria-label="Diagram"
              onChange={(event) =>
                setSource(
                  event.target.value === "large"
                    ? largeMermaidFixture
                    : mermaidFixtures[event.target.value as keyof typeof mermaidFixtures],
                )
              }
              defaultValue="pie"
            >
              {Object.keys(mermaidFixtures).map((key) => (
                <option key={key}>{key}</option>
              ))}
              <option>large</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} /> Dark theme
          </label>
          <label>
            <input type="checkbox" checked={ascii} onChange={(event) => setAscii(event.target.checked)} /> ASCII mode
          </label>
          <label>
            <input type="checkbox" checked={streaming} onChange={(event) => setStreaming(event.target.checked)} />{" "}
            Streaming
          </label>
          <label>
            <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />{" "}
            Fullscreen styles
          </label>
          <button className="rounded border p-1" disabled={running} onClick={() => void runMatrix()}>
            Run render/export matrix
          </button>
        </div>
        <label>
          Mermaid source
          <textarea
            aria-label="Mermaid source"
            className="mb-4 block w-full border p-2 font-mono text-sm"
            rows={5}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </label>
        <div className={fullscreen ? "markdown-mermaid-fullscreen" : ""} style={fullscreen ? { height: 450 } : {}}>
          <MermaidBlock source={source} theme={theme} mode={ascii ? "ascii" : "svg"} deferRender={streaming} />
        </div>
        <h2 className="mt-6">Verification results {running ? "(running)" : ""}</h2>
        <pre className="whitespace-pre-wrap text-xs" aria-label="Verification results">
          {results.join("\n")}
        </pre>
      </main>
    </I18nProvider>
  )
}
createRoot(document.getElementById("root")!).render(<App />)
