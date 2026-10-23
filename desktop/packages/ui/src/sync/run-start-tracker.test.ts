import { beforeEach, describe, expect, test } from "vitest"

import { noteSessionRunStatus, takeSessionRunStartedAt } from "./run-start-tracker"

describe("run start tracker", () => {
  beforeEach(() => {
    takeSessionRunStartedAt("a")
    takeSessionRunStartedAt("b")
  })

  test("a run observed from its start reports that start once", () => {
    noteSessionRunStatus("a", "busy", 100)
    expect(takeSessionRunStartedAt("a")).toBe(100)
    expect(takeSessionRunStartedAt("a")).toBeNull()
  })

  test("busy or retry repeated inside a run keeps the first start", () => {
    noteSessionRunStatus("a", "busy", 100)
    noteSessionRunStatus("a", "retry", 150)
    noteSessionRunStatus("a", "busy", 200)
    expect(takeSessionRunStartedAt("a")).toBe(100)
  })

  test("a run that was already going when the app attached is not placed", () => {
    noteSessionRunStatus("a", "idle", 100)
    expect(takeSessionRunStartedAt("a")).toBeNull()
  })

  test("ignores unknown statuses and sessions are independent", () => {
    noteSessionRunStatus("a", undefined, 100)
    noteSessionRunStatus("a", "weird", 100)
    noteSessionRunStatus("b", "busy", 300)
    expect(takeSessionRunStartedAt("a")).toBeNull()
    expect(takeSessionRunStartedAt("b")).toBe(300)
  })

  test("the next run gets its own start", () => {
    noteSessionRunStatus("a", "busy", 100)
    takeSessionRunStartedAt("a")
    noteSessionRunStatus("a", "busy", 500)
    expect(takeSessionRunStartedAt("a")).toBe(500)
  })
})
