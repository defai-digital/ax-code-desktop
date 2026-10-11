import React from "react"
import { createRoot } from "react-dom/client"
import "@openchamber/ui/index.css"
import { I18nProvider } from "@/lib/i18n"
import { ThemeSystemProvider } from "@/contexts/ThemeSystemContext"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import ToolOutputDialog from "@/components/chat/message/ToolOutputDialog"
import type { ToolPopupContent } from "@/components/chat/message/types"

const root = createRoot(document.getElementById("root")!)
let kind = "file"
let source = ""
let running = false
let frames: number[] = []
let delays: number[] = []
let pending: number[] = []
let tasks: number[] = []
let receivedKeys = 0
let lastFrame = 0
let timer: ReturnType<typeof setTimeout>
const errors: string[] = []
const workers = { created: 0, messages: 0, failed: 0 }
const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) {
    super(url, options)
    workers.created++
    this.addEventListener("message", () => workers.messages++)
    this.addEventListener("error", e => { workers.failed++; errors.push(`Worker: ${e.message}`) })
  }
}
window.addEventListener("error", e => errors.push(e.message))
window.addEventListener("unhandledrejection", e => errors.push(String(e.reason)))
new PerformanceObserver(list => { if (running) tasks.push(...list.getEntries().map(e => e.duration)) })
  .observe({ type: "longtask" })
document.addEventListener("keydown", e => {
  if (running && e.isTrusted) { receivedKeys++; pending.push(performance.now()) }
}, true)
function frame(now: number) {
  if (running) {
    if (lastFrame) frames.push(now - lastFrame)
    lastFrame = now
    const keys = pending.splice(0)
    if (keys.length) requestAnimationFrame(next => delays.push(...keys.map(key => next - key)))
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
const file = Array.from({ length: 4000 }, (_, i) => i === 3999
  ? 'export const finalFixture4000 = "complete";'
  : `export const fixture${i + 1} = { value: ${i}, text: "file rendering fixture" };`).join("\n")
const patch = "diff --git a/fixture.ts b/fixture.ts\nnew file mode 100644\n--- /dev/null\n+++ b/fixture.ts\n@@ -0,0 +1,4000 @@\n" + file.split("\n").map(line => "+" + line).join("\n") + "\n"
function render() {
  const popup: ToolPopupContent = kind === "file"
    ? { open: true, title: "Read fixture", content: `<type>file</type><content>${source}</content>`, metadata: { tool: "read", input: { filePath: "fixture.ts" } } }
    : { open: true, title: "Patch fixture", content: source, isDiff: true, metadata: { tool: "apply_patch" } }
  root.render(<I18nProvider><ThemeSystemProvider><ThemeProvider>
    <ToolOutputDialog popup={popup} onOpenChange={() => {}} syntaxTheme={{}} isMobile={false} />
  </ThemeProvider></ThemeSystemProvider></I18nProvider>)
}
function shadowState() {
  let nodes = 0
  let text = ""
  for (const host of document.querySelectorAll("diffs-container")) {
    if (host.shadowRoot) {
      nodes += host.shadowRoot.querySelectorAll("*").length
      text += host.shadowRoot.textContent
    }
  }
  return { nodes, finalRowMounted: text.includes("finalFixture4000"), syntaxTokens: document.querySelector("diffs-container")?.shadowRoot?.querySelectorAll("[style]").length ?? 0 }
}
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] ?? 0
;(window as any).codeFixture = {
  setup(next: string) { kind = next; source = next === "file" ? "export const warmup = 1;" : patch.replace("+1,4000", "+1,1").split("\n").slice(0, 6).join("\n") + "\n"; render() },
  start() {
    const dialog = document.querySelector('[role="dialog"]')!
    let input = dialog.querySelector<HTMLTextAreaElement>("[data-perf-probe]")
    if (!input) { input = document.createElement("textarea"); input.dataset.perfProbe = ""; input.setAttribute("aria-label", "Performance typing probe"); input.style.cssText = "height:32px;min-height:32px;flex-shrink:0;width:100%"; dialog.prepend(input) }
    input.value = ""; input.focus()
    frames = []; delays = []; pending = []; tasks = []; receivedKeys = 0; lastFrame = 0; running = true
    timer = setTimeout(() => { source = kind === "file" ? file : patch; render() }, 500)
  },
  stop() {
    running = false; clearTimeout(timer)
    return { kind, sourceBytes: new TextEncoder().encode(source).length, receivedKeys,
      inputCharacters: document.querySelector<HTMLTextAreaElement>("[data-perf-probe]")?.value.length,
      keyToFrameP95Ms: percentile(delays, .95), frameP95Ms: percentile(frames, .95), frameMaxMs: Math.max(...frames),
      longTaskCount: tasks.length, longTaskTotalMs: tasks.reduce((a, b) => a + b, 0), longTaskMaxMs: Math.max(0, ...tasks),
      documentNodes: document.querySelectorAll("*").length, shadow: shadowState(), workers: { ...workers }, errors: [...errors] }
  },
  scrollBottom() {
    const viewport = document.querySelector<HTMLElement>("[data-tool-code-viewport] > div:last-child")
      ?? document.querySelector<HTMLElement>(".tool-output-surface.h-full")!
    viewport.scrollTop = viewport.scrollHeight
  },
  shadowState,
}
