import { describe, expect, test } from "vitest"
import { pickEvictableSeenSessionIds } from "../session-cache"

describe("pickEvictableSeenSessionIds", () => {
  test("keeps a session that is working or waiting on the user", () => {
    // Those caches hold the dialog the session is blocked on, and the reconnect and poll candidates
    // are read from the same slices: dropping them left the session with nothing on screen and no
    // path back until the user opened it again.
    const seen = ["ses_busy", "ses_waiting", "ses_idle"]

    expect(pickEvictableSeenSessionIds(seen, new Set(["ses_busy", "ses_waiting"]))).toEqual(["ses_idle"])
  })

  test("evicts everything when nothing is protected", () => {
    expect(pickEvictableSeenSessionIds(["ses_a", "ses_b"], new Set())).toEqual(["ses_a", "ses_b"])
  })
})
