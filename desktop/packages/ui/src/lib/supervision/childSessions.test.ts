import { describe, expect, test } from "vitest"
import { childSessionSummaries, type ChildSessionSummary } from "./childSessions"

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
