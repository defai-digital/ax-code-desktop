import { describe, expect, test } from "vitest"

import { paletteHasNeedsYou, rankPaletteSessions } from "./paletteRanking"

const session = (id: string, updated: number) => ({ id, time: { updated } })

describe("rankPaletteSessions", () => {
  test("board sessions keep urgency order ahead of more recent sessions that are not on the board", () => {
    const sessions = [session("recent", 900), session("running", 500), session("waiting", 100), session("older", 50)]
    const rows = [
      { sessionId: "waiting", state: "permission" as const },
      { sessionId: "running", state: "running" as const },
    ]
    expect(rankPaletteSessions(sessions, rows).map((item) => item.id)).toEqual(["waiting", "running", "recent", "older"])
  })

  test("without board rows the order is most recent first", () => {
    expect(rankPaletteSessions([session("a", 1), session("b", 3), session("c", 2)], []).map((item) => item.id)).toEqual([
      "b",
      "c",
      "a",
    ])
  })

  test("reports whether anything needs the user", () => {
    expect(paletteHasNeedsYou([{ sessionId: "a", state: "running" }])).toBe(false)
    expect(paletteHasNeedsYou([{ sessionId: "a", state: "question" }])).toBe(true)
  })
})
