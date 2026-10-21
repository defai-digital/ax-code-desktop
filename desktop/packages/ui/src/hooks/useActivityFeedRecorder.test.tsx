import React from "react"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { SupervisionRow } from "@/lib/supervision/rows"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { cleanup, render } from "@/test/dom"
import { useActivityFeedRecorder } from "./useActivityFeedRecorder"

function row(state: SupervisionState, sessionId = "s1"): SupervisionRow {
  return {
    sessionId,
    title: "Parser",
    state,
    treeSessionIds: [sessionId],
    projectId: null,
    projectLabel: "Desktop",
    directory: "/repo",
    updatedAt: 1,
    evidence: null,
    goal: null,
  }
}

function Harness({ enabled = true }: { enabled?: boolean }) {
  useActivityFeedRecorder(enabled)
  return null
}

describe("useActivityFeedRecorder", () => {
  beforeEach(() => {
    useSupervisionStore.setState({ rows: [] })
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
  })

  afterEach(() => {
    cleanup()
    useSupervisionStore.setState({ rows: [] })
    useActivityFeedStore.setState({ events: [], seenAt: 0 })
  })

  test("does not record sessions that appear after an empty baseline", () => {
    render(<Harness />)
    act(() => {
      useSupervisionStore.setState({ rows: [row("running"), row("error", "s2")] })
    })
    expect(useActivityFeedStore.getState().events).toEqual([])
  })

  test("records a later state change and not the first populated snapshot", () => {
    useSupervisionStore.setState({ rows: [row("idle")] })
    render(<Harness />)
    expect(useActivityFeedStore.getState().events).toEqual([])
    act(() => {
      useSupervisionStore.setState({ rows: [row("error")] })
    })
    expect(useActivityFeedStore.getState().events).toMatchObject([{ sessionId: "s1", from: "idle", to: "error" }])
  })

  test("a disabled recorder stays quiet until it is enabled and a later change happens", () => {
    useSupervisionStore.setState({ rows: [row("idle")] })
    const view = render(<Harness enabled={false} />)
    act(() => {
      useSupervisionStore.setState({ rows: [row("running")] })
    })
    expect(useActivityFeedStore.getState().events).toEqual([])
    view.rerender(<Harness enabled />)
    expect(useActivityFeedStore.getState().events).toEqual([])
    act(() => {
      useSupervisionStore.setState({ rows: [row("review")] })
    })
    expect(useActivityFeedStore.getState().events).toMatchObject([{ sessionId: "s1", from: "running", to: "review" }])
  })
})
