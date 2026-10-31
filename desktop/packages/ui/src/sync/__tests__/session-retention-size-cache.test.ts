import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { PartMap } from "../part-map"
import { SessionRetention, DIRECTORY_CONTENT_MAX_BYTES } from "../session-retention"
import { INITIAL_STATE, type State } from "../types"

const counter = vi.hoisted(() => ({ calls: 0 }))

vi.mock("@/lib/retainedPayloadSize", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/retainedPayloadSize")>()
  return {
    retainedPayloadSize: (value: unknown) => {
      counter.calls += 1
      return original.retainedPayloadSize(value)
    },
  }
})

const message = (sessionID: string, index = 0): Message =>
  ({
    id: `msg_${sessionID}_${index}`,
    sessionID,
    role: "assistant",
    time: { created: index, completed: index + 1 },
  }) as Message

const part = (info: Message, text = "hello"): Part => ({
  id: `prt_${info.id}`,
  messageID: info.id,
  sessionID: info.sessionID,
  type: "text",
  text,
})

function makeState(entries: Array<{ sessionID: string; text?: string }>): State {
  const messages: Record<string, Message[]> = {}
  const partEntries: Array<[string, Part[]]> = []
  for (const entry of entries) {
    const info = message(entry.sessionID)
    messages[entry.sessionID] = [info]
    partEntries.push([info.id, [part(info, entry.text ?? "hello")]])
  }
  return {
    ...INITIAL_STATE,
    message: messages,
    part: PartMap.from(partEntries),
    session_status: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
  }
}

describe("SessionRetention size cache", () => {
  beforeEach(() => {
    counter.calls = 0
  })

  test("a second sweep over unchanged state makes zero retainedPayloadSize calls", () => {
    const retention = new SessionRetention()
    const state = makeState([{ sessionID: "ses_a" }, { sessionID: "ses_b" }])
    retention.sweep(state, new Set(), 1000)
    // Two sessions, each priced once for its own slices and once for its parts.
    expect(counter.calls).toBe(4)
    counter.calls = 0
    const result = retention.sweep(state, new Set(), 1000)
    expect(counter.calls).toBe(0)
    expect(result.patch).toBeUndefined()
    expect(retention.stats.sessions).toBe(2)
  })

  test("a part update in one session re-prices only that session's changed part array", () => {
    const retention = new SessionRetention()
    const state = makeState([{ sessionID: "ses_a" }, { sessionID: "ses_b" }])
    retention.sweep(state, new Set(), 1000)
    counter.calls = 0
    const infoA = state.message.ses_a[0]
    const next: State = {
      ...state,
      part: state.part.withEntries([[infoA.id, [part(infoA, "changed and longer")]]]),
    }
    retention.sweep(next, new Set(), 1000)
    // Exactly one call: the changed part array of ses_a. Its own slices keep
    // their references, and ses_b is untouched, so nothing else is re-priced.
    expect(counter.calls).toBe(1)
  })

  test("eviction over the byte cap still happens with cached sizes", () => {
    const retention = new SessionRetention()
    const text = "x".repeat(DIRECTORY_CONTENT_MAX_BYTES / 2)
    const state = makeState([{ sessionID: "ses_large", text }])
    const first = retention.sweep(state, new Set(["ses_large"]), 1000)
    expect(first.evicted).toEqual([])
    counter.calls = 0
    const second = retention.sweep(state, new Set(), 1000)
    // The second sweep reuses the cached size, so it evicts with zero pricing.
    expect(counter.calls).toBe(0)
    expect(second.evicted).toEqual(["ses_large"])
    expect(second.patch?.message.ses_large).toBeUndefined()
  })
})
