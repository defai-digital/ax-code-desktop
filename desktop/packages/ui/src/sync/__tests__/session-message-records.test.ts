import { describe, expect, test, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { Message, Part, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { buildSessionMessageRecordsSnapshot } from "../session-message-records"
import { createUserMessageHistorySelector } from "../user-message-history"
import { subscribeSessionMessageRecords } from "../session-message-subscription"
import { recordPartChanges } from "../part-changes"
import { INITIAL_STATE, type State } from "../types"
import { PartMap } from "../part-map"

const text = (value: string): Part[] => [{ type: "text", text: value } as Part]
const initial = (): State => ({
  ...INITIAL_STATE,
  session: [{ id: "s" } as Session],
  message: {
    s: [
      { id: "u", role: "user" },
      { id: "a", role: "assistant" },
    ] as Message[],
  },
  part: PartMap.from({ u: text("prompt"), a: text("reply") }),
})
const change = (state: State, id: string, value: string, hinted = true): State => {
  const part = state.part.withEntries([[id, text(value)]])
  if (hinted) recordPartChanges(state.part, part, new Set([id]))
  return { ...state, part }
}

describe("session message projections", () => {
  test("updates only hinted records, reuses indexes, and preserves old snapshots", () => {
    const state = initial()
    const before = buildSessionMessageRecordsSnapshot(state, "s")
    const nextState = change(state, "a", "stream")
    const part = nextState.part
    const reads = vi.spyOn(part, "get")
    recordPartChanges(state.part, part, new Set(["a"]))
    const next = buildSessionMessageRecordsSnapshot({ ...nextState, part }, "s", before)
    expect(reads.mock.calls).toEqual([["a"]])
    expect(next.indexById).toBe(before.indexById)
    expect(next.list[0]).toBe(before.list[0])
    expect(next.list[1].parts).toEqual(text("stream"))
    expect(before.list[1].parts).toEqual(text("reply"))
    reads.mockClear()
    expect(buildSessionMessageRecordsSnapshot({ ...nextState, part }, "s", next)).toBe(next)
    expect(reads).not.toHaveBeenCalled()
  })

  test("fallback catches skipped updates, unhinted snapshots, and duplicate IDs", () => {
    const state = initial()
    const before = buildSessionMessageRecordsSnapshot(state, "s")
    const skipped = change(state, "u", "edited")
    const latest = change(skipped, "a", "latest")
    const next = buildSessionMessageRecordsSnapshot(latest, "s", before)
    expect(next.list.map((r) => r.parts)).toEqual([text("edited"), text("latest")])
    expect(buildSessionMessageRecordsSnapshot(change(latest, "u", "snapshot", false), "s", next).list[0].parts).toEqual(
      text("snapshot"),
    )
    const duplicates = { ...state, message: { s: [state.message.s[0], state.message.s[0]] } }
    const dupBefore = buildSessionMessageRecordsSnapshot(duplicates, "s")
    expect(
      buildSessionMessageRecordsSnapshot(change(duplicates, "u", "both"), "s", dupBefore).list.map((r) => r.parts),
    ).toEqual([text("both"), text("both")])
  })

  test("handles message replacement, suspension, resume, deletion, and session switches", () => {
    const state = initial()
    const before = buildSessionMessageRecordsSnapshot(state, "s")
    const changed = change(state, "a", "new")
    const paused = buildSessionMessageRecordsSnapshot(changed, "s", before, true)
    expect(paused.list[1]).toBe(before.list[1])
    const resumed = buildSessionMessageRecordsSnapshot(changed, "s", paused)
    expect(resumed.list[1].parts).toEqual(text("new"))
    const metadata = { ...changed, message: { s: [{ ...state.message.s[0], time: { created: 42 } } as Message] } }
    const next = buildSessionMessageRecordsSnapshot(metadata, "s", resumed)
    expect(next.list).toHaveLength(1)
    expect(next.list[0].info).toBe(metadata.message.s[0])
    expect(buildSessionMessageRecordsSnapshot(metadata, "other", next).list).toEqual([])
    expect(buildSessionMessageRecordsSnapshot({ ...metadata, part: PartMap.from({}) }, "s", next).list[0].parts).toEqual([])
  })

  test("user history ignores assistant updates but accepts edits, revert, and recovery", () => {
    const select = createUserMessageHistorySelector()
    const state = initial()
    const before = select(state, "s")
    const stream = change(state, "a", "stream")
    const part = stream.part
    const reads = vi.spyOn(part, "get")
    recordPartChanges(state.part, part, new Set(["a"]))
    expect(select({ ...stream, part }, "s")).toBe(before)
    expect(reads).not.toHaveBeenCalled()
    const edited = change(stream, "u", "edited")
    expect(select(edited, "s")).toEqual(["edited"])
    const reverted = { ...edited, session: [{ id: "s", revert: { messageID: "u" } } as Session] }
    expect(select(reverted, "s")).toEqual([])
    expect(select(edited, "s")).toEqual(["edited"])
    expect(select(change(edited, "u", "restored", false), "s")).toEqual(["restored"])
    expect(select(edited, "other")).toEqual([])
    const added = {
      ...edited,
      message: { s: [...edited.message.s, { id: "v", role: "user" } as Message] },
      part: edited.part.withEntries([["v", [{ type: "text", text: "" } as Part, ...text("second"), ...text("ignored")]]]),
    }
    expect(select(added, "s")).toEqual(["second", "edited"])
  })

  test("user subscriptions skip assistant parts and notify on revert alone, even while suspended", () => {
    const store = createStore<State>(() => initial())
    const user = vi.fn()
    const paused = vi.fn()
    const stop = subscribeSessionMessageRecords(store, "s", user, false, "user")
    const stopPaused = subscribeSessionMessageRecords(store, "s", paused, true)
    store.setState(change(store.getState(), "a", "stream"))
    expect(user).not.toHaveBeenCalled()
    store.setState(change(store.getState(), "u", "edit", false))
    expect(user).toHaveBeenCalledTimes(1)
    store.setState({ session: [{ id: "s", revert: { messageID: "u" } } as Session] })
    expect(user).toHaveBeenCalledTimes(2)
    expect(paused).toHaveBeenCalledTimes(1)
    store.setState({ session: [{ id: "s" } as Session] })
    expect(user).toHaveBeenCalledTimes(3)
    stop()
    stopPaused()
  })
})
