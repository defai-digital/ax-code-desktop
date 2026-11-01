import { expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { PartMap } from "./part-map"
import { BACKGROUND_MESSAGE_LIMIT, SessionRetention } from "./session-retention"
import { DIR_IDLE_TTL_MS, INITIAL_STATE, type State } from "./types"

function countedMessage(reads: { count: number }, sessionID: string, index: number): Message {
  const id = `msg_${sessionID}_${index}`
  const info = {
    sessionID,
    role: "assistant",
    time: { created: index, completed: index + 1 },
  } as Message
  Object.defineProperty(info, "id", {
    enumerable: true,
    get() {
      reads.count += 1
      return id
    },
  })
  return info
}

function textPart(info: Message, text = "x", session = true): Part {
  const part = {
    id: `prt_${info.id}`,
    messageID: info.id,
    type: "text",
    text,
  } as Part
  if (session) part.sessionID = info.sessionID
  return part
}

function stateFor(sessionID: string, messages: Message[], sessionOnPart: boolean): State {
  return {
    ...INITIAL_STATE,
    message: { [sessionID]: messages },
    part: PartMap.from(messages.map((info) => [info.id, [textPart(info, "x", sessionOnPart)]])),
  }
}

test("unchanged sweeps read no message ids, and trim, part changes, and idle TTL still apply", () => {
  const reads = { count: 0 }
  const long = Array.from({ length: BACKGROUND_MESSAGE_LIMIT + 1 }, (_, index) =>
    countedMessage(reads, "ses_long", index),
  )
  const state = stateFor("ses_long", long, true)
  const retention = new SessionRetention()
  reads.count = 0
  const first = retention.sweep(state, new Set(), 0)
  expect(first.patch?.message.ses_long).toHaveLength(BACKGROUND_MESSAGE_LIMIT)
  expect(first.patch?.part.has(long[0].id)).toBe(false)
  expect(first.patch?.part.has(long[BACKGROUND_MESSAGE_LIMIT].id)).toBe(true)
  expect(reads.count).toBeGreaterThan(0)

  // The manager applies the patch, so the next sweep sees new refs and walks once more.
  if (!first.patch) throw new Error("expected a trim patch")
  const applied: State = { ...state, ...first.patch }
  reads.count = 0
  expect(retention.sweep(applied, new Set(), 0).patch).toBeUndefined()
  expect(reads.count).toBeGreaterThan(0)

  // Sweeps of the same applied state, as streaming arms every second, read nothing.
  reads.count = 0
  const second = retention.sweep(applied, new Set(), 0)
  expect(reads.count).toBe(0)
  expect(second.patch).toBeUndefined()

  const kept = long[BACKGROUND_MESSAGE_LIMIT]
  const changed: State = {
    ...state,
    part: state.part.withEntries([[kept.id, [textPart(kept, "changed")]]]),
  }
  const trimmed = retention.sweep(changed, new Set(), 0)
  expect(trimmed.patch?.message.ses_long).toHaveLength(BACKGROUND_MESSAGE_LIMIT)
  expect(trimmed.patch?.part.get(kept.id)?.[0]).toMatchObject({ text: "changed" })

  const bare = Array.from({ length: BACKGROUND_MESSAGE_LIMIT + 1 }, (_, index) =>
    countedMessage({ count: 0 }, "ses_bare", index),
  )
  const bareResult = new SessionRetention().sweep(stateFor("ses_bare", bare, false), new Set(), 0)
  expect(bareResult.patch?.message.ses_bare).toHaveLength(BACKGROUND_MESSAGE_LIMIT)
  expect(bareResult.patch?.part.has(bare[0].id)).toBe(false)
  expect(bareResult.patch?.part.has(bare[BACKGROUND_MESSAGE_LIMIT].id)).toBe(true)

  const idle = stateFor("ses_idle", [countedMessage({ count: 0 }, "ses_idle", 0)], true)
  const idleRetention = new SessionRetention()
  expect(idleRetention.sweep(idle, new Set(), 0).evicted).toEqual([])
  const expired = idleRetention.sweep(idle, new Set(), DIR_IDLE_TTL_MS)
  expect(expired.evicted).toEqual(["ses_idle"])
  expect(expired.patch?.message.ses_idle).toBeUndefined()
  expect(expired.patch?.part.size).toBe(0)
})
