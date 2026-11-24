import { describe, expect, test } from "vitest"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { countNeedsYou, type NeedsYouCountView } from "./needsYouCount"
import type { SupervisionState } from "./sessionState"

const row = (sessionId: string, state: SupervisionState, directory: string | null = "/repo") => ({
  sessionId,
  directory,
  state,
})

const page = (overrides: Partial<NeedsYouCountView>): NeedsYouCountView => ({
  browserId: "b1",
  directory: "/repo",
  sessionID: null,
  waiting: true,
  visible: false,
  ...overrides,
})

describe("countNeedsYou", () => {
  test("counts sessions waiting on a decision, a blocked goal included, once each", () => {
    const rows = [
      row("a", "permission"),
      row("b", "question"),
      row("c", "goal"),
      row("d", "running"),
      row("e", "error"),
      row("f", "review"),
      row("g", "idle"),
    ]
    // Failed and finished work are follow-ups, not decisions.
    expect(countNeedsYou(rows, {})).toBe(3)
  })

  test("adds a waiting browser page that no counted session already covers", () => {
    const rows = [row("a", "permission")]
    const views = {
      // The page of a session already counted is not counted again.
      [viewKeyFor("/repo", "a")]: page({ sessionID: "a" }),
      [viewKeyFor("/repo", "x")]: page({ sessionID: "x" }),
      // A page on screen, not waiting, or without a browser does not need anyone.
      [viewKeyFor("/repo", "y")]: page({ sessionID: "y", visible: true }),
      [viewKeyFor("/repo", "z")]: page({ sessionID: "z", waiting: false }),
      [viewKeyFor("/repo", "w")]: page({ sessionID: "w", browserId: undefined }),
    }
    expect(countNeedsYou(rows, views)).toBe(2)
  })
})
