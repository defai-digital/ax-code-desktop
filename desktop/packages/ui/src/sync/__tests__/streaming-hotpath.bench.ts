/**
 * Controlled CPU microbenchmark, not a renderer/FPS or user-latency benchmark.
 * Run: pnpm --dir desktop/packages/ui exec tsx src/sync/__tests__/streaming-hotpath.bench.ts
 */
import assert from "node:assert/strict"
import type { Event, Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { applyDirectoryEvent, prepareEventDraft } from "../event-reducer"
import { applyPartDeltaBatch } from "../part-delta-batch"
import { PartMap } from "../part-map"
import { INITIAL_STATE, type State } from "../types"
import { projectTurnRecords } from "../../components/chat/lib/turns/projectTurnRecords"
import {
  createDisplayMessageProjector,
  projectDisplayMessages,
} from "../../components/chat/lib/turns/projectDisplayMessages"
import { createMarkdownWorkerResponder } from "../../components/chat/markdownWorkerParser"
import type { ChatMessageEntry } from "../../components/chat/lib/turns/types"

const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
const ignore = () => {}
const rethrow = (_event: Event, error: unknown) => {
  throw error
}

for (const size of [200, 2000, 8000]) {
  const state: State = {
    ...INITIAL_STATE,
    part: PartMap.from(
      Array.from(
        { length: size },
        (_, index) => [`m${index}`, [{ id: `p${index}`, type: "text", text: "" } as Part]] as const,
      ),
    ),
  }
  const events = Array.from(
    { length: 20 },
    (_, index): Event => ({
      type: "message.part.delta",
      properties: { sessionID: "benchmark", messageID: `m${index}`, partID: `p${index}`, field: "text", delta: "x" },
    }),
  )
  const measure = (batch: boolean) => {
    const samples: number[] = []
    for (let run = 0; run < 6; run++) {
      let current = state
      const started = performance.now()
      for (let frame = 0; frame < 20; frame++) {
        if (batch) {
          current = applyPartDeltaBatch(current, events, ignore, rethrow)!
        } else {
          for (const event of events) {
            const draft = prepareEventDraft(current, event)
            applyDirectoryEvent(draft, event)
            current = draft
          }
        }
      }
      if (run > 0) samples.push((performance.now() - started) / 20)
      for (let index = 0; index < 20; index++)
        assert.equal((current.part.get(`m${index}`)![0] as { text: string }).text, "x".repeat(20))
    }
    return median(samples)
  }
  const sequentialMs = measure(false)
  const batchedMs = measure(true)
  console.log(
    JSON.stringify({
      cachedMessages: size,
      deltasPerBatch: 20,
      sequentialMs,
      batchedMs,
      speedup: sequentialMs / batchedMs,
    }),
  )
}

const messages: ChatMessageEntry[] = Array.from({ length: 500 }, (_, index) => [
  { info: { id: `u${index}`, role: "user", time: { created: index } } as Message, parts: [] },
  {
    info: { id: `a${index}`, role: "assistant", parentID: `u${index}`, time: { created: index } } as Message,
    parts: Array.from(
      { length: 10 },
      (_, part) => ({ id: `t${part}`, type: "text", text: "Historical content ".repeat(100) }) as Part,
    ),
  },
]).flat()
const previous = projectTurnRecords(messages)
const tail = messages.at(-1)!
const changed = [
  ...messages.slice(0, -1),
  { ...tail, parts: [...tail.parts, { id: "new", type: "text", text: "tail" } as Part] },
]
assert.deepEqual(projectTurnRecords(changed, { previousProjection: previous }), projectTurnRecords(changed))
const measureProjection = (reuse: boolean) => {
  const samples: number[] = []
  for (let run = 0; run < 6; run++) {
    const start = performance.now()
    for (let frame = 0; frame < 50; frame++) {
      projectTurnRecords(changed, { previousProjection: reuse ? previous : null })
    }
    if (run > 0) samples.push((performance.now() - start) / 50)
  }
  return median(samples)
}
const fullMs = measureProjection(false)
const incrementalMs = measureProjection(true)
console.log(JSON.stringify({ turns: 500, fullMs, incrementalMs, speedup: fullMs / incrementalMs }))

// Preserve actual changing source identities across frames, as the session store
// does. A same-array repeat would only measure a memo hit.
const updates = Array.from({ length: 50 }, (_, index) => [
  ...messages.slice(0, -1),
  { ...tail, parts: [...tail.parts, { id: "new", type: "text", text: "x".repeat(index + 1) } as Part] },
])
const measureDisplay = (incremental: boolean) => {
  const samples: number[] = []
  for (let run = 0; run < 6; run++) {
    const project = incremental ? createDisplayMessageProjector() : projectDisplayMessages
    let result = project(messages)
    const started = performance.now()
    for (const update of updates) result = project(update)
    if (run > 0) samples.push((performance.now() - started) / updates.length)
    assert.deepEqual(result, projectDisplayMessages(updates[updates.length - 1]))
  }
  return median(samples)
}
console.log(
  JSON.stringify({
    case: "display-normalization",
    turns: 500,
    fullMs: measureDisplay(false),
    incrementalMs: measureDisplay(true),
  }),
)

// Node structuredClone is a transfer-cost proxy, not an Electron IPC timing.
const respond = createMarkdownWorkerResponder()
const markdown = "## Result\n\nSome **formatted** text with `code`.\n\n".repeat(1500)
const first = respond({ id: 1, ownerId: 1, text: markdown, baseKey: "benchmark", live: true })
const suffix = respond({
  id: 2,
  ownerId: 1,
  baseRevision: 1,
  text: markdown + "Next paragraph",
  baseKey: "benchmark",
  live: true,
})
assert.ok(suffix.stablePrefixCount && suffix.blocks && first.blocks)
const complete = [...first.blocks.slice(0, suffix.stablePrefixCount), ...suffix.blocks]
const measureClone = (value: unknown) => {
  const samples: number[] = []
  for (let run = 0; run < 6; run++) {
    const started = performance.now()
    structuredClone(value)
    if (run > 0) samples.push(performance.now() - started)
  }
  return median(samples)
}
console.log(
  JSON.stringify({
    case: "markdown-response-clone-proxy",
    characters: markdown.length,
    fullBlocks: complete.length,
    suffixBlocks: suffix.blocks.length,
    fullJsonBytes: Buffer.byteLength(JSON.stringify(complete)),
    suffixJsonBytes: Buffer.byteLength(JSON.stringify(suffix)),
    fullCloneMs: measureClone(complete),
    suffixCloneMs: measureClone(suffix),
  }),
)
