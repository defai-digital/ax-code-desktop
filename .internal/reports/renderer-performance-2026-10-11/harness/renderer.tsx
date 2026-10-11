import React from "react"
import { I18nProvider } from "@/lib/i18n"
import { ThemeSystemProvider } from "@/contexts/ThemeSystemContext"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { createRoot } from "react-dom/client"
import "@openchamber/ui/index.css"
import MessageList from "@/components/chat/MessageList-impl"
import { ChatInput } from "@/components/chat/ChatInput-impl"
import { ChildStoreManager } from "@/sync/child-store"
import { useSessionMessageRecords, useUserMessageHistory } from "@/sync/sync-context"
import { INITIAL_STATE } from "@/sync/types"
import { applyDirectoryEvent, prepareEventDraft } from "@/sync/event-reducer"
import { applyPartDeltaBatch } from "@/sync/part-delta-batch"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import { markdownWorkerClient } from "@/components/chat/markdownWorkerClient"

const workerStats = { requested: 0, completed: 0, failed: 0 }
const requestMarkdown = markdownWorkerClient.request.bind(markdownWorkerClient)
markdownWorkerClient.request = (owner, input, result) => {
  workerStats.requested++
  requestMarkdown(owner, input, (blocks) => {
    if (blocks) workerStats.completed++
    else workerStats.failed++
    result(blocks)
  })
}

const directory = "/renderer-performance-fixture"
const sid = "ses_perf"
const childStores = new ChildStoreManager()
const store = childStores.ensureChild(directory, { bootstrap: false })
useSessionUIStore.setState({ currentSessionId: sid })
useDirectoryStore.setState({ currentDirectory: directory })
const Context = (globalThis as any).__openchamber_sync_context__
const noop = () => {}
const handlers = { onChunk: noop, onComplete: noop }
const inertApi: any = new Proxy(() => Promise.resolve([]), { get: () => inertApi })
let tail = ""
let ticks = 0
let receivedKeys = 0
let inputRenders = 0
let running = false
let timer: ReturnType<typeof setInterval>
let raf = 0
let lastFrame = 0
let frameGaps: number[] = []
let keyToFrame: number[] = []
let pendingKeys: number[] = []
let longTasks: number[] = []
let eventTimings: any[] = []
let started = 0
let expected = 0
let config: any
const errors: string[] = []
window.addEventListener("error", event => errors.push(event.message))
window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)))
new PerformanceObserver(list => { if (running) longTasks.push(...list.getEntries().map(e => e.duration)) })
  .observe({ type: "longtask", buffered: false })
new PerformanceObserver(list => { if (running) eventTimings.push(...list.getEntries().map((e: any) =>
  ({ name: e.name, duration: e.duration, queueMs: e.processingStart - e.startTime }))) })
  .observe({ type: "event", durationThreshold: 16, buffered: false } as any)
document.addEventListener("keydown", event => {
  if (running && event.isTrusted) { receivedKeys++; pendingKeys.push(performance.now()) }
}, true)
function frame(now: number) {
  if (running) {
    if (lastFrame) frameGaps.push(now - lastFrame)
    lastFrame = now
    const keys = pendingKeys.splice(0)
    // One more RAF allows React's input event update and intervening paint.
    if (keys.length) requestAnimationFrame(after => keyToFrame.push(...keys.map(key => after - key)))
  }
  raf = requestAnimationFrame(frame)
}
raf = requestAnimationFrame(frame)
function sessionState(messages: number) {
  const message: any[] = []
  const part: any = {}
  for (let i = 0; i < messages; i++) {
    const id = `msg_${String(i).padStart(6, "0")}`
    const role = i % 2 ? "assistant" : "user"
    message.push({ id, sessionID: sid, role, parentID: role === "assistant" ? message[i - 1]?.id : undefined,
      time: { created: i + 1, ...(role === "assistant" && i < messages - 1 ? { completed: i + 2 } : {}) },
      modelID: "fixture", providerID: "fixture", agent: "build", mode: "build", path: { cwd: directory, root: directory },
      cost: 0, tokens: { input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } })
    part[id] = [{ id: `prt_${i}`, sessionID: sid, messageID: id, type: "text",
      text: role === "user" ? `Review project task ${i}` : `### Completed task ${i}\n\nHistorical explanation with **formatting** and \`code\`.\n\n- Change reviewed\n- Tests passed\n` }]
  }
  const id = message[messages - 1].id
  tail = config.kind === "paragraph" ? "An unfinished **paragraph** with inline `code` and context. ".repeat(1500) : ""
  part[id][0].text = tail
  if (config.kind === "tool") part[id] = [{ id: "prt_tool", messageID: id, sessionID: sid, type: "tool",
    tool: "bash", callID: "call_perf", state: { status: "running", input: { command: "fixture build" },
      time: { start: Date.now() }, title: "Fixture build", metadata: { output: "" } } }]
  return { ...INITIAL_STATE, status: "ready", session: [{ id: sid, directory, title: "Performance fixture", version: "fixture",
    time: { created: 1, updated: 1 } }], message: { [sid]: message }, part, session_status: { [sid]: { type: "busy" } } } as any
}
function InputHistoryProbe() {
  useUserMessageHistory(sid, directory)
  inputRenders++
  return null
}
function App() {
  const records = useSessionMessageRecords(sid, directory)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [records])
  return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <InputHistoryProbe />
    <div ref={scrollRef} data-scrollbar="chat" style={{ overflow: "auto", flex: 1, minHeight: 0, padding: 24 }}>
      <MessageList sessionKey={sid} turnStart={0} messages={records as any} sessionIsWorking
        activeStreamingMessageId={records.at(-1)?.info.id} activeStreamingPhase="streaming"
        onMessageContentChange={noop} getAnimationHandlers={() => handlers} hasMoreAbove={false}
        isLoadingOlder={false} onLoadOlder={noop} scrollRef={scrollRef} />
    </div>
    <ChatInput />
  </div>
}
const root = createRoot(document.getElementById("root")!)
function render() { root.render(<Context.Provider value={{ childStores, directory, sdk: inertApi }}>
  <RuntimeAPIContext.Provider value={inertApi}><I18nProvider><ThemeSystemProvider><ThemeProvider><App /></ThemeProvider></ThemeSystemProvider></I18nProvider></RuntimeAPIContext.Provider>
</Context.Provider>) }
const percentile = (values: number[], q: number) => {
  if (!values.length) return null
  return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]
}
;(window as any).perfFixture = {
  setup(next: any) {
    config = next
    store.setState(sessionState(next.messages))
    render()
    return true
  },
  start() {
    frameGaps = []; keyToFrame = []; longTasks = []; eventTimings = []; pendingKeys = []
    ticks = 0; receivedKeys = 0; inputRenders = 0; lastFrame = 0
    workerStats.requested = 0; workerStats.completed = 0; workerStats.failed = 0
    running = true; started = performance.now(); expected = started
    const messageID = store.getState().message[sid].at(-1)!.id
    timer = setInterval(() => {
      if (config.idle) return
      expected += 50
      const state = store.getState()
      if (config.kind === "tool") {
        if (performance.now() - started < 500 || ticks > 0) return
        tail = "Compiled fixture module: 100% complete; no errors.\n".repeat(4000)
        const previous = state.part[messageID][0] as any
        const event: any = { type: "message.part.updated", properties: { part: { ...previous,
          state: { ...previous.state, status: "completed", output: tail, metadata: { output: tail },
            time: { ...previous.state.time, end: Date.now() } } } } }
        const next = prepareEventDraft(state, event)
        applyDirectoryEvent(next, event)
        store.setState(next)
      } else {
        const delta = config.kind === "paragraph" ? "Additional **inline detail** without a paragraph break. ".repeat(5)
          : "\n\n### Stream update\n\n- **Result:** reviewed\n- `example` validated\n\n```ts\nconst value = 42\n```\n"
        const next = applyPartDeltaBatch(state, [{ type: "message.part.delta", properties: {
          sessionID: sid, messageID, partID: `prt_${config.messages - 1}`, field: "text", delta,
        } }], noop, (_event, error) => { throw error })
        if (next) store.setState(next)
      }
      ticks++
    }, 50)
    const input = document.querySelector<HTMLTextAreaElement>("textarea")
    input?.focus()
    return { textarea: !!input, disabled: input?.disabled, text: input?.value }
  },
  stop() {
    clearInterval(timer); running = false
    return { config, elapsedMs: performance.now() - started, ticks, targetUpdatesPerSecond: 20,
      receivedKeys, inputRenders, inputCharacters: document.querySelector("textarea")?.value.length,
      frameSamples: frameGaps.length, frameP50Ms: percentile(frameGaps, .5), frameP95Ms: percentile(frameGaps, .95),
      frameMaxMs: Math.max(0, ...frameGaps), frameGapsOver50Ms: frameGaps.filter(v => v > 50).length,
      keyToFrameP50Ms: percentile(keyToFrame, .5), keyToFrameP95Ms: percentile(keyToFrame, .95),
      keyToFrameMaxMs: Math.max(0, ...keyToFrame), longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((a, b) => a + b, 0), longTaskMaxMs: Math.max(0, ...longTasks),
      eventTimings, domNodes: document.querySelectorAll("*").length,
      historyEntriesInDOM: document.querySelectorAll("[data-turn-entry]").length,
      toolOutputBytes: config.kind === "tool" ? tail.length : null,
      renderedToolOutput: document.body.innerText.includes("Compiled fixture module"), errors,
      workerStats: { ...workerStats }, formattedStrongNodes: document.querySelectorAll(".markdown-content strong").length }
  },
}
