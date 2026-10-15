import { describe, expect, test } from "vitest"

import { rollUpChildStates } from "./rollup"

describe("rollUpChildStates", () => {
  test("a child's pending permission surfaces on its root session", () => {
    const states = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "running" },
      { sessionId: "child", parentId: "root", state: "idle" },
      { sessionId: "grandchild", parentId: "child", state: "permission" },
      { sessionId: "other", parentId: null, state: "idle" },
    ])
    expect(states.get("root")).toEqual({ state: "permission", sessionIds: ["root", "child", "grandchild"] })
    expect(states.get("other")?.state).toBe("idle")
    expect(states.has("child")).toBe(false)
  })

  test("a working root stays running when a finished child left changes to review", () => {
    const states = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "running" },
      { sessionId: "child", parentId: "root", state: "review" },
    ])
    expect(states.get("root")?.state).toBe("running")
  })

  test("an orphan subtree is kept under its topmost loaded session only while it needs a person", () => {
    const blocked = rollUpChildStates([
      { sessionId: "middle", parentId: "archived", state: "idle" },
      { sessionId: "leaf", parentId: "middle", state: "question" },
    ])
    expect(blocked.get("middle")?.state).toBe("question")
    expect(blocked.has("leaf")).toBe(false)

    const finished = rollUpChildStates([{ sessionId: "orphan", parentId: "gone", state: "idle" }])
    expect(finished.size).toBe(0)
  })
})
