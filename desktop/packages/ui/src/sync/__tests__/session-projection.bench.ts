/** CPU-only benchmark; excludes event publication, Markdown, layout, and paint.
 * Run: pnpm --dir desktop/packages/ui exec tsx src/sync/__tests__/session-projection.bench.ts
 */
import assert from "node:assert/strict"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import type { SessionMessageRecord } from "../../types/sessionMessages"
import { buildSessionMessageRecordsSnapshot } from "../session-message-records"
import { createUserMessageHistorySelector } from "../user-message-history"
import { recordPartChanges } from "../part-changes"
import { PartMap } from "../part-map"
import { INITIAL_STATE, type State } from "../types"

// Mirrors the pre-change active-session rebuild and input-history projection.
function baseline(state: State, previous: SessionMessageRecord[]) {
  const byId = new Map(previous.map((record) => [record.info.id, record]))
  const nextById = new Map<string, SessionMessageRecord>()
  const list = state.message.s.map((info) => {
    const old = byId.get(info.id)
    const parts = state.part.get(info.id)!
    const record = old?.info === info && old.parts === parts ? old : { info, parts }
    nextById.set(info.id, record)
    return record
  })
  return { list, byId: nextById }
}
function history(records: SessionMessageRecord[]) {
  return records
    .filter((record) => record.info.role === "user")
    .reverse()
    .flatMap((record) => {
      const part = record.parts.find((part) => part.type === "text" && part.text.length > 0)
      return part?.type === "text" ? [part.text] : []
    })
}
function median(samples: number[]) {
  return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]
}
for (const size of [500, 4000]) {
  const messages = Array.from(
    { length: size },
    (_, i) => ({ id: `m${i}`, role: i % 2 ? "assistant" : "user" }) as Message,
  )
  const initial: State = {
    ...INITIAL_STATE,
    message: { s: messages },
    part: PartMap.from(messages.map((message) => [message.id, [{ type: "text", text: message.id } as Part]] as const)),
  }
  const states = [initial]
  for (let i = 0; i < 200; i++) {
    const previous = states[states.length - 1]
    const part = previous.part.withEntries([[`m${size - 1}`, [{ type: "text", text: `stream${i}` } as Part]]])
    recordPartChanges(previous.part, part, new Set([`m${size - 1}`]))
    states.push({ ...previous, part })
  }
  const measure = (optimized: boolean) => {
    const samples: number[] = []
    for (let run = 0; run < 6; run++) {
      let snapshot = buildSessionMessageRecordsSnapshot(initial, "s")
      let old = { list: snapshot.list, byId: new Map(snapshot.list.map((record) => [record.info.id, record])) }
      const select = createUserMessageHistorySelector()
      const originalHistory = select(initial, "s")
      let result = originalHistory
      const started = performance.now()
      for (const state of states.slice(1)) {
        if (optimized) {
          snapshot = buildSessionMessageRecordsSnapshot(state, "s", snapshot)
          result = select(state, "s")
        } else {
          // The previous implementation already had the ID map from its last snapshot.
          const nextById = new Map<string, SessionMessageRecord>()
          const list = state.message.s.map((info) => {
            const previous = old.byId.get(info.id)
            const parts = state.part.get(info.id)!
            const record = previous?.info === info && previous.parts === parts ? previous : { info, parts }
            nextById.set(info.id, record)
            return record
          })
          old = { list, byId: nextById }
          result = history(old.list)
        }
      }
      if (run > 0) samples.push((performance.now() - started) / 200)
      assert.deepEqual(result, originalHistory)
      if (optimized) {
        assert.equal(result, originalHistory)
        assert.deepEqual(snapshot.list, baseline(states[200], old.list).list)
      }
    }
    return median(samples)
  }
  const baselineMs = measure(false)
  const incrementalMs = measure(true)
  console.log(
    JSON.stringify({ messages: size, frames: 200, baselineMs, incrementalMs, speedup: baselineMs / incrementalMs }),
  )
}
