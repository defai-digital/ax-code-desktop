import { describe, expect, test } from "vitest"

import type { ChatMessageEntry } from "../turns/types"
import { collectRailTurns, timelineWindow, turnPreview } from "./timelineRailModel"

const prompt = (id: string, text: string, created?: number): ChatMessageEntry =>
  ({
    info: { id, role: "user", time: created === undefined ? {} : { created } },
    parts: [{ type: "text", text }],
  }) as unknown as ChatMessageEntry

describe("timelineWindow", () => {
  test("draws nothing for a single turn or without room", () => {
    expect(timelineWindow(1, 10, 0)).toEqual([])
    expect(timelineWindow(5, 0, 0)).toEqual([])
  })

  test("draws every turn when they fit", () => {
    expect(timelineWindow(3, 10, 1).map((tick) => tick.index)).toEqual([0, 1, 2])
  })

  test("centers the window on the active turn when turns exceed the room", () => {
    expect(timelineWindow(20, 5, 10).map((tick) => tick.index)).toEqual([8, 9, 10, 11, 12])
  })

  test("clamps the window at both ends", () => {
    expect(timelineWindow(20, 5, 0).map((tick) => tick.index)).toEqual([0, 1, 2, 3, 4])
    expect(timelineWindow(20, 5, 19).map((tick) => tick.index)).toEqual([15, 16, 17, 18, 19])
  })

  test("favors the newest turns at the bottom but keeps the active one", () => {
    expect(timelineWindow(20, 5, 3, true).map((tick) => tick.index)).toEqual([3, 4, 5, 6, 7])
    expect(timelineWindow(20, 5, 19, true).map((tick) => tick.index)).toEqual([15, 16, 17, 18, 19])
  })
})

describe("turnPreview", () => {
  test("uses the first non-empty line, normalized", () => {
    expect(turnPreview("\n\n  fix   the\tbug \nsecond line")).toBe("fix the bug")
  })

  test("caps long prompts in code points", () => {
    const preview = turnPreview("😀".repeat(200), 10)
    expect(Array.from(preview)).toHaveLength(10)
    expect(preview.endsWith("…")).toBe(true)
  })
})

describe("collectRailTurns", () => {
  test("needs at least two turns", () => {
    expect(collectRailTurns([prompt("a", "one")], ["a"], new Map())).toEqual([])
  })

  test("returns turns in turn order with time and preview", () => {
    const messages = [prompt("b", "second", 2000), prompt("a", "first", 1000)]
    expect(collectRailTurns(messages, ["a", "b"], new Map())).toEqual([
      { id: "a", created: 1000, preview: "first" },
      { id: "b", created: 2000, preview: "second" },
    ])
  })

  test("ignores synthetic and ignored text and tolerates a missing time", () => {
    const entry = {
      info: { id: "a", role: "user", time: {} },
      parts: [
        { type: "text", text: "hidden", synthetic: true },
        { type: "text", text: "also hidden", ignored: true },
        { type: "text", text: "visible" },
      ],
    } as unknown as ChatMessageEntry
    expect(collectRailTurns([entry, prompt("b", "next", 5)], ["a", "b"], new Map())[0]).toEqual({
      id: "a",
      created: null,
      preview: "visible",
    })
  })

  test("reuses a cached preview instead of scanning the prompt again", () => {
    const cache = new Map([["a", "cached"]])
    const turns = collectRailTurns([prompt("a", "changed"), prompt("b", "x")], ["a", "b"], cache)
    expect(turns[0]?.preview).toBe("cached")
  })
})
