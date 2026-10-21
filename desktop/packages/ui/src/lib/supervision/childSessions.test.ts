import { describe, expect, test } from "vitest"
import { childSessionSummaries, inlineChildSessions, type ChildSessionSummary } from "./childSessions"

const child = (sessionId: string, state: ChildSessionSummary["state"], title = sessionId): ChildSessionSummary => ({
  sessionId,
  state,
  title,
  updatedAt: 1000,
})

describe("childSessionSummaries", () => {
  test("excludes the root, preserves descendant order and each child's own state and age", () => {
    const sessions = [
      child("root", "permission"),
      child("a", "running", "  Codex worker  "),
      child("nested", "question"),
      child("b", "idle", " "),
    ]
    expect(
      childSessionSummaries("root", ["root", "a", "nested", "b"], new Map(sessions.map((s) => [s.sessionId, s]))),
    ).toEqual([{ ...sessions[1], title: "Codex worker" }, sessions[2], { ...sessions[3], title: "b" }])
  })
  test("handles a root-only tree, unloaded IDs and duplicate descendants without fabricating state", () => {
    const sessions = new Map([["a", child("a", "review")]])
    expect(childSessionSummaries("root", ["root"], sessions)).toEqual([])
    expect(childSessionSummaries("root", ["missing", "a", "root", "a"], sessions)).toEqual([sessions.get("a")])
  })
})

describe("inlineChildSessions", () => {
  test("puts children that need a person first, newest first within a state, and counts the rest", () => {
    const children = [
      { ...child("idle-new", "idle"), updatedAt: 9000 },
      { ...child("run-old", "running"), updatedAt: 1000 },
      { ...child("run-new", "running"), updatedAt: 5000 },
      child("asks", "question"),
      child("idle-old", "idle"),
    ]
    const { shown, hidden } = inlineChildSessions(children)
    expect(shown.map((entry) => entry.sessionId)).toEqual(["asks", "run-new", "run-old"])
    expect(hidden).toBe(2)
    expect(inlineChildSessions(undefined)).toEqual({ shown: [], hidden: 0 })
  })
})
