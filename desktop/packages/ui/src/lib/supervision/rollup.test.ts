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

  test("a child's blocked goal never raises its root state", () => {
    const states = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "idle" },
      { sessionId: "child", parentId: "root", state: "goal" },
    ])
    expect(states.get("root")?.state).toBe("idle")
    expect(states.get("root")?.sessionIds).toEqual(["root", "child"])

    const running = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "running" },
      { sessionId: "child", parentId: "root", state: "goal" },
    ])
    expect(running.get("root")?.state).toBe("running")

    const errored = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "error" },
      { sessionId: "child", parentId: "root", state: "goal" },
    ])
    expect(errored.get("root")?.state).toBe("error")

    const reviewed = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "review" },
      { sessionId: "child", parentId: "root", state: "goal" },
    ])
    expect(reviewed.get("root")?.state).toBe("review")

    // Child first in the list still does not raise the root.
    const childFirst = rollUpChildStates([
      { sessionId: "child", parentId: "root", state: "goal" },
      { sessionId: "root", parentId: null, state: "idle" },
    ])
    expect(childFirst.get("root")?.state).toBe("idle")
    expect(childFirst.get("root")?.sessionIds).toEqual(["root", "child"])
  })

  test("a root's own blocked goal still raises its own state", () => {
    const states = rollUpChildStates([
      { sessionId: "root", parentId: null, state: "goal" },
      { sessionId: "child", parentId: "root", state: "review" },
    ])
    expect(states.get("root")?.state).toBe("goal")
  })

  test("an orphan subtree with a blocked goal is kept because it needs a person", () => {
    const states = rollUpChildStates([{ sessionId: "orphan", parentId: "gone", state: "goal" }])
    expect(states.get("orphan")?.state).toBe("goal")
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
