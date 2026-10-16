import { describe, expect, test } from "vitest"
import { mergeSessionListPage } from "../session-list-merge"

const session = (id: string, parentID?: string) => ({ id, parentID })

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

  test("returns the listed page when there is nothing local to add", () => {
    const page = [session("ses_a"), session("ses_b")]

    expect(mergeSessionListPage(page, [session("ses_a", "ses_z")])).toEqual(page)
  })
})
