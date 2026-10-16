import { describe, expect, test } from "vitest"
import { getGlobalSyncSessionStatus, setSyncRefs } from "../sync-refs"

type FakeState = {
  session: Array<{ id: string; time?: { created?: number; updated?: number } }>
  session_status: Record<string, { type: string }>
}

const setStores = (states: FakeState[]) => {
  setSyncRefs(
    {
      children: new Map(states.map((state, index) => [`/dir-${index}`, { getState: () => state }])),
    } as never,
    "/active",
  )
}

describe("getGlobalSyncSessionStatus", () => {
  test("prefers the busy status of the session's current store over another store's stale idle one", () => {
    // A session that moved between projects can be present in two stores. Returning the
    // first store that holds an entry answered `idle` from the old one, which reads as
    // "the turn finished" and lets a queued message be sent into a running turn.
    setStores([
      { session: [{ id: "ses_1", time: { created: 1, updated: 100 } }], session_status: { ses_1: { type: "idle" } } },
      { session: [{ id: "ses_1", time: { created: 1, updated: 200 } }], session_status: { ses_1: { type: "busy" } } },
    ])

    expect(getGlobalSyncSessionStatus("ses_1")).toEqual({ type: "busy" })
  })

  test("answers undefined for a session no store knows", () => {
    setStores([{ session: [], session_status: {} }])

    expect(getGlobalSyncSessionStatus("ses_missing")).toBeUndefined()
  })
})
