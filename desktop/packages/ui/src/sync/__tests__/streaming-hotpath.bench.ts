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
