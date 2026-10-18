import { describe, expect, test } from "vitest"
import { mergeSessionListPage } from "../session-list-merge"

const session = (id: string, parentID?: string, updated?: number) => ({ id, parentID, time: { updated } })

describe("mergeSessionListPage", () => {
  test("keeps a child session the page does not list, in sorted order", () => {
    const page = [session("ses_a"), session("ses_c")]
    const merged = mergeSessionListPage(page, [session("ses_a"), session("ses_c"), session("ses_b", "ses_a")])

    // The store's lookups binary-search this array, so the order is an invariant.
    expect(merged.map((entry) => entry.id)).toEqual(["ses_a", "ses_b", "ses_c"])
  })

  test("does not duplicate a child the page already lists", () => {
    const page = [session("ses_a"), session("ses_b", "ses_a")]
    expect(mergeSessionListPage(page, [session("ses_a"), session("ses_b", "ses_a")])).toHaveLength(2)
  })

  test("does not carry over a root session the page no longer has", () => {
    // The page is authoritative for roots: a missing one was deleted or archived.
    const merged = mergeSessionListPage([session("ses_c")], [session("ses_a"), session("ses_b", "ses_c")])

    expect(merged.map((entry) => entry.id)).toEqual(["ses_b", "ses_c"])
  })

  test("carries over a root that appeared while the page was in flight", () => {
    // The answer comes from an index the request had already read, so a session created during the
    // flight is legitimately missing from it. Dropping it hid the session the user had just created
    // until the runtime's next update for it.
    const knownBeforeRequest = new Map([["ses_old", 1]])
    const merged = mergeSessionListPage(
      [session("ses_old")],
      [session("ses_old"), session("ses_new")],
      knownBeforeRequest,
    )

    expect(merged.map((entry) => entry.id)).toEqual(["ses_new", "ses_old"])
  })

  test("still drops a known root the page no longer lists", () => {
    const knownBeforeRequest = new Map([
      ["ses_gone", 1],
      ["ses_old", 1],
    ])
    const merged = mergeSessionListPage([session("ses_old")], [session("ses_old"), session("ses_gone")], knownBeforeRequest)

    expect(merged.map((entry) => entry.id)).toEqual(["ses_old"])
  })

  test("does not resurrect a session deleted while the page was in flight", () => {
    // The page was read before the delete; the session is gone from the current store.
    const knownBeforeRequest = new Map([["ses_gone", 10]])
    const merged = mergeSessionListPage([session("ses_gone", undefined, 10), session("ses_ok", undefined, 10)], [], knownBeforeRequest)

    expect(merged.map((entry) => entry.id)).toEqual(["ses_ok"])
  })

  test("keeps a local update that landed after the page was read", () => {
    // A rename/share applied while the request was in flight is newer than the page's copy.
    const knownBeforeRequest = new Map([["ses_a", 10]])
    const merged = mergeSessionListPage(
      [session("ses_a", undefined, 10)],
      [session("ses_a", undefined, 20)],
      knownBeforeRequest,
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].time?.updated).toBe(20)
  })

  test("returns the listed page when there is nothing local to add", () => {
    const page = [session("ses_a"), session("ses_b")]

    expect(mergeSessionListPage(page, [session("ses_a", "ses_z")])).toEqual(page)
  })
})
