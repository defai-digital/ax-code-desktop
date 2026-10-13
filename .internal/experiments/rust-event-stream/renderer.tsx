import React, { useLayoutEffect, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { createEventPipeline } from "@/sync/event-pipeline"
import { createSyncPerformanceRecorder } from "@/sync/performance"
import { applyPartDeltaBatch } from "@/sync/part-delta-batch"
import { INITIAL_STATE } from "@/sync/types"

const parameters = new URLSearchParams(location.search)
const projects = Number(parameters.get("projects"))
const mode = parameters.get("mode")
const revisions = 40
const tokens = 50
const epoch = () => performance.timeOrigin + performance.now()
const states = new Map()
for (let project = 0; project < projects; project++) {
  states.set(`/fixture/${project}`, {
    ...INITIAL_STATE,
    part: Object.fromEntries(
      Array.from({ length: 2000 }, (_, revision) => [
        `msg_${project}_${revision}`,
        [{ id: "prt_live", type: "text", text: "" }],
      ]),
    ),
  })
}
let snapshot = Array.from({ length: projects }, () => ({ revision: 0, sentAt: epoch(), text: "" }))
const listeners = new Set<() => void>()
const commits: number[] = []
const nextFrameProxy: number[] = []
const keyToFrameProxy: number[] = []
const appliedRevision = Array.from({ length: projects }, () => 0)
const acknowledgement = new Map<number, { remaining: Set<string>; cursor: string }>()
let finished = false
let callbackErrors = 0
let firstReadyAt: number | undefined
const startAt = epoch()
const recorder = createSyncPerformanceRecorder()

function App() {
  const rows = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => snapshot,
  )
  useLayoutEffect(() => {
    for (let project = 0; project < rows.length; project++) {
      const row = rows[project]
      if (row.revision <= appliedRevision[project]) continue
      appliedRevision[project] = row.revision
      if (row.revision > 4) {
        commits.push(epoch() - row.sentAt)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            nextFrameProxy.push(epoch() - row.sentAt)
          }),
        )
      }
    }
  }, [rows])
  return (
    <main>
      <textarea id="input" aria-label="Fixture input" />
      <div>
        {rows.map((row, project) => (
          <pre key={project}>
            {project}: {row.revision}: {row.text}
          </pre>
        ))}
      </div>
    </main>
  )
}
flushSync(() => createRoot(document.getElementById("root")!).render(<App />))
const input = document.getElementById("input") as HTMLTextAreaElement
input.focus()
input.addEventListener("keydown", (event) => {
  requestAnimationFrame(() => {
    keyToFrameProxy.push(performance.now() - event.timeStamp)
  })
})

// The benchmark-only adapter waits for per-directory pipeline fences before acknowledging a batch.
// Production transport types/permissions are not changed by this experiment.
window.fixtureOnBatch = (sequence, batch, hooks) => {
  const directories = new Set<string>()
  for (const frame of batch.frames) {
    if (frame.type === "ready") {
      hooks.onConnected({ first: true, transport: "ws" })
    } else {
      directories.add(frame.payload.type === "server.resync_required" ? "global" : frame.directory)
      hooks.onFrame(frame, { transport: "ws", eventId: frame.eventId })
    }
  }
  if (directories.size === 0) {
    window.fixture.ack(sequence, batch.cursor)
    return
  }
  acknowledgement.set(sequence, { remaining: directories, cursor: batch.cursor })
  for (const directory of directories) {
    hooks.onFrame(
      { type: "event", directory, payload: { type: "fixture.batch-applied", properties: { sequence } } },
      { transport: "ws" },
    )
  }
}

const pipeline = createEventPipeline({
  sdk: {} as never,
  performanceRecorder: recorder,
  onReconnect: () => {
    firstReadyAt ??= epoch()
  },
  onDeltaBatch: (directory, events) => {
    const state = applyPartDeltaBatch(
      states.get(directory),
      events,
      () => {},
      () => {
        callbackErrors++
      },
    )
    if (state) states.set(directory, state)
  },
  onEvent: (directory, event) => {
    const payload = event as unknown as {
      type: string
      properties: { sequence: number; project: number; revision: number; sentAt: number }
    }
    if (payload.type === "fixture.batch-applied") {
      const pending = acknowledgement.get(payload.properties.sequence)!
      pending.remaining.delete(directory)
      if (pending.remaining.size === 0) {
        acknowledgement.delete(payload.properties.sequence)
        window.fixture.ack(payload.properties.sequence, pending.cursor)
      }
      return
    }
    if (payload.type !== "fixture.revision") return
    const { project, revision, sentAt } = payload.properties
    const text = states.get(directory).part[`msg_${project}_${revision}`][0].text
    if (text.length !== tokens) throw new Error("Fixture text was lost or reordered")
    snapshot = [...snapshot]
    snapshot[project] = { revision, sentAt, text }
    for (const listener of listeners) listener()
  },
})

const percentile = (values: number[], p: number) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * p) - 1]
}
const finishPoll = setInterval(() => {
  if (finished || appliedRevision.some((revision) => revision !== revisions)) return
  finished = true
  clearInterval(finishPoll)
  setTimeout(() => {
    pipeline.cleanup()
    window.fixture.finished({
      mode,
      projects,
      callbackErrors,
      totalAppliedCharacters: Array.from(states.values()).reduce(
        (total, state) =>
          total + Object.values(state.part).reduce((sum: number, parts: any) => sum + parts[0].text.length, 0),
        0,
      ),
      textLengths: snapshot.map((row) => row.text.length),
      appliedRevisions: [...appliedRevision],
      commitSamples: commits.length,
      publishToReactCommitP95Ms: percentile(commits, 0.95),
      publishToNextFrameProxyP95Ms: percentile(nextFrameProxy, 0.95),
      keyToFrameProxyP95Ms: percentile(keyToFrameProxy, 0.95),
      typedCharacters: input.value.length,
      firstReadyMs: firstReadyAt === undefined ? null : firstReadyAt - startAt,
      sync: recorder.snapshot(),
    })
  }, 80)
}, 20)
window.fixture.start()
