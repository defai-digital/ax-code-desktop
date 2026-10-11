import React from "react"
import { createRoot } from "react-dom/client"
import "@openchamber/ui/index.css"
import { I18nProvider } from "@/lib/i18n"
import { ThemeSystemProvider } from "@/contexts/ThemeSystemContext"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { MarkdownRenderer } from "@/components/chat/MarkdownRendererImpl"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"

const fixture = window as any
const SyncContext = fixture.__openchamber_sync_context__
const syncSystem = { childStores: { children: new Map(), subscribeAll: () => () => {} }, sdk: {}, directory: "" }
let source = "Warmup **ready**."
let live = true
let scenario = "paragraph"
let running = false
let lastFrame = 0
let frames: number[] = []
let tasks: number[] = []
let samples: { revision: number; elapsedMs: number }[] = []
let current: { revision: number; start: number } | null = null
const errors: string[] = []
let receivedKeys = 0
let workerMessages = 0
let nativeRequests = 0
let blockedFavicons = 0
document.addEventListener("securitypolicyviolation", (event) => {
  if (event.blockedURI.includes("icons.duckduckgo.com")) blockedFavicons++
})
const NativeWorker = window.Worker
const useNative = new URLSearchParams(location.search).get("parser") === "rust"
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    if (useNative && String(url).includes("markdownParser")) {
      const facade = {
        onmessage: null as any,
        onerror: null as any,
        onmessageerror: null as any,
        alive: true,
        postMessage(request: unknown) {
          nativeRequests++
          fixture.nativeMarkdownBenchmark
            .parse(request)
            .then((response: any) => {
              if (response.error) errors.push(response.error)
              if (facade.alive) {
                workerMessages++
                facade.onmessage?.({ data: response })
              }
            })
            .catch((error: unknown) => {
              errors.push(String(error))
              facade.onerror?.({ message: String(error) })
            })
        },
        terminate() {
          facade.alive = false
        },
      }
      return facade as unknown as Worker
    }
    super(url, options)
    this.addEventListener("message", () => workerMessages++)
    this.addEventListener("error", (event) => errors.push(`Worker: ${event.message}`))
  }
}
window.addEventListener("error", (event) => errors.push(event.message))
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)))
new PerformanceObserver((list) => {
  if (running) tasks.push(...list.getEntries().map((entry) => entry.duration))
}).observe({ type: "longtask" })
document.addEventListener(
  "keydown",
  (event) => {
    if (running && event.isTrusted) receivedKeys++
  },
  true,
)
function frame(now: number) {
  if (running) {
    if (lastFrame) frames.push(now - lastFrame)
    lastFrame = now
  }
  if (
    current &&
    Array.from(document.querySelectorAll("strong")).some(
      (element) => element.textContent === `END_${current!.revision}`,
    )
  ) {
    const completed = current
    current = null
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        samples.push({ revision: completed.revision, elapsedMs: performance.now() - completed.start })
      }),
    )
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
const root = createRoot(document.getElementById("root")!)
function render() {
  root.render(
    <SyncContext.Provider value={syncSystem}>
      <RuntimeAPIContext.Provider value={{} as any}>
        <I18nProvider>
          <ThemeSystemProvider>
            <ThemeProvider>
              <div style={{ width: 1000, margin: "20px auto" }}>
                <textarea aria-label="Performance typing probe" style={{ width: "100%", height: 40 }} defaultValue="" />
                <div style={{ height: 780, overflow: "auto" }} data-markdown-probe>
                  <MarkdownRenderer
                    content={source}
                    messageId="native-bench"
                    isStreaming={live}
                    isAnimated={false}
                    enableFileReferences={false}
                  />
                </div>
              </div>
            </ThemeProvider>
          </ThemeSystemProvider>
        </I18nProvider>
      </RuntimeAPIContext.Provider>
    </SyncContext.Provider>,
  )
}
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? 0
fixture.markdownFixture = {
  setup(kind: string) {
    scenario = kind
    render()
  },
  start() {
    running = true
    frames = []
    tasks = []
    samples = []
    receivedKeys = 0
    lastFrame = 0
    document.querySelector("textarea")!.focus()
  },
  publish(revision: number) {
    const base =
      scenario === "small"
        ? "Small **body** with `code`. "
        : scenario === "links"
          ? "- [link](https://example.com/path)\n".repeat(600)
          : scenario === "paragraph"
            ? "Streaming text with **bold** words and `code`. ".repeat(4500)
            : "## Section\n\nA **bold** paragraph with [link](#fixture-section-01).\n\n".repeat(3000)
    source =
      base + Array.from({ length: revision + 1 }, (_, index) => `\n\nRevision ${index} **END_${index}**\n\n`).join("")
    current = { revision, start: performance.now() }
    performance.mark(`ax-markdown:start:${revision}`)
    render()
  },
  completed(revision: number) {
    return samples.some((sample) => sample.revision === revision)
  },
  stop() {
    running = false
    const measured = samples.filter((sample) => sample.revision >= 3)
    const viewport = document.querySelector("[data-markdown-probe]")!.getBoundingClientRect()
    const marker = Array.from(document.querySelectorAll("strong")).find(element => element.textContent === "END_12")?.getBoundingClientRect()
    return {
      parser: useNative ? "rust" : "js",
      scenario,
      sourceCharacters: source.length,
      samples,
      firstFormattedPaintP95Ms: p95(measured.map((sample) => sample.elapsedMs)),
      coldFirstFormattedPaintMs: samples[0]?.elapsedMs,
      frameP95Ms: p95(frames),
      frameMaxMs: Math.max(0, ...frames),
      longTaskCount: tasks.length,
      longTaskTotalMs: tasks.reduce((a, b) => a + b, 0),
      longTaskMaxMs: Math.max(0, ...tasks),
      receivedKeys,
      inputCharacters: document.querySelector("textarea")!.value.length,
      workerMessages,
      nativeRequests,
      blockedFavicons,
      documentNodes: document.querySelectorAll("*").length,
      boldNodes: document.querySelectorAll("strong").length,
      finalMarker: document.querySelector("[data-markdown-probe]")!.textContent!.includes("END_12"),
      markerVisible: !!marker && marker.top >= viewport.top && marker.bottom <= viewport.bottom,
      errors,
    }
  },
}
