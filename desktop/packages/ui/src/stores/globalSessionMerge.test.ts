import { describe, expect, test } from "vitest"
import { mergeFallbackSessions } from "./globalSessionMerge"

const session = (id: string) => ({ id })

describe("mergeFallbackSessions", () => {
  test("keeps the stored record for an id the fallback also carries", () => {
    // The fallback is captured before the reload, so it can predate a change the store already
    // applied - marking a session done, for instance. Overwriting by id brought the stale copy
    // back as active.
    const stored = [{ id: "ses_1", status: "done" }]
    const stale = [{ id: "ses_1", status: "working" }]

    expect(mergeFallbackSessions(stored, stale)).toBe(stored)
  })

  test("appends sessions the store does not know yet", () => {
    const stored = [session("ses_1")]
    const fallback = [session("ses_1"), session("ses_2")]

    expect(mergeFallbackSessions(stored, fallback)).toEqual([{ id: "ses_1" }, { id: "ses_2" }])
  })

  test("does not re-add a session the store holds in the other list", () => {
    // Archiving moves the session out of active; adding the fallback's stale active copy back
    // would show it in both lists.
    const stored = [session("ses_1")]
    const fallback = [session("ses_2")]

    expect(mergeFallbackSessions(stored, fallback, new Set(["ses_2"]))).toBe(stored)
  })

  test("keeps the stored list when there is nothing to merge", () => {
    const stored = [session("ses_1")]

    expect(mergeFallbackSessions(stored, undefined)).toBe(stored)
    expect(mergeFallbackSessions(stored, [])).toBe(stored)
  })
})
