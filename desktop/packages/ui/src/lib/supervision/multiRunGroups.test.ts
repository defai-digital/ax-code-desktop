import { describe, expect, test } from "vitest"

import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import { groupMultiRunRows, multiRunGroupKeyFromParsed } from "./multiRunGroups"

const row = (sessionId: string, title: string) => ({ sessionId, title })

describe("groupMultiRunRows", () => {
  test("groups lanes by slug and labels them with the model from the title", () => {
    const groups = groupMultiRunRows(
      [row("b", "bench/openai/gpt/2"), row("a", "bench/anthropic/claude"), row("other", "plain session")],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["bench"])
    const group = groups.get("bench")
    expect(group?.label).toBe("bench")
    expect(group?.lanes.map((lane) => lane.sessionId)).toEqual(["a", "b"])
    expect(group?.lanes.map((lane) => lane.laneLabel)).toEqual(["anthropic/claude", "openai/gpt #2"])
  })

  test("keeps an optional run group as its own compare key and drops fusion sessions", () => {
    const groups = groupMultiRunRows(
      [
        row("lane", "bench/g2/anthropic/claude"),
        row("fusion", "bench/g2/anthropic/claude/fusion"),
        row("other-batch", "bench/g1/openai/gpt"),
        row("legacy", "bench/google/gemini"),
      ],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["bench/g2", "bench/g1", "bench"])
    expect(groups.get("bench/g2")?.label).toBe("bench · g2")
    expect(groups.get("bench/g2")?.lanes.map((lane) => lane.sessionId)).toEqual(["lane"])
    expect(groups.get("bench")?.lanes.map((lane) => lane.sessionId)).toEqual(["legacy"])
  })

  test("returns an empty map when nothing parses as a lane", () => {
    expect(groupMultiRunRows([row("a", "notes")], parseMultiRunSessionTitle).size).toBe(0)
    expect(multiRunGroupKeyFromParsed(parseMultiRunSessionTitle("bench/anthropic/claude/fusion"))).toBeNull()
    expect(multiRunGroupKeyFromParsed(parseMultiRunSessionTitle("bench/g2/anthropic/claude"))).toBe("bench/g2")
  })
})
