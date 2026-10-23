import React from "react"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { SupervisionRow } from "@/lib/supervision/rows"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { selectUnreadActivityCount, useActivityFeedStore } from "@/stores/useActivityFeedStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
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
    useSupervisionStore.setState({ rows: [], missionControlOpen: false })
    useSessionUIStore.setState({ currentSessionId: null })
    useActivityFeedStore.setState({ events: [], seenAt: 0, sessionSeenAt: {} })
  })

  afterEach(() => {
    cleanup()
    useSessionUIStore.setState({ currentSessionId: null })
    useSupervisionStore.setState({ rows: [], missionControlOpen: false })
    useActivityFeedStore.setState({ events: [], seenAt: 0, sessionSeenAt: {} })
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

  const finishSession = (sessionId: string) => {
    useSupervisionStore.setState({ rows: [row("running", sessionId)] })
    return () => act(() => useSupervisionStore.setState({ rows: [row("review", sessionId)] }))
  }
  const unread = () => selectUnreadActivityCount(useActivityFeedStore.getState())

  test("a run that finishes in the session being watched leaves no unread ticket", () => {
    useSessionUIStore.setState({ currentSessionId: "s1" })
    const finish = finishSession("s1")
    render(<Harness />)
    finish()
    expect(useActivityFeedStore.getState().events).toHaveLength(1)
    expect(unread()).toBe(0)
  })

  test("a run that finishes in another session stays unread until that session is opened", () => {
    useSessionUIStore.setState({ currentSessionId: "s1" })
    const finish = finishSession("s2")
    render(<Harness />)
    finish()
    expect(unread()).toBe(1)
    act(() => useSessionUIStore.setState({ currentSessionId: "s2" }))
    expect(unread()).toBe(0)
  })

  test("the board covering the chat is not looking at the session", () => {
    useSessionUIStore.setState({ currentSessionId: "s1" })
    useSupervisionStore.setState({ missionControlOpen: true })
    const finish = finishSession("s1")
    render(<Harness />)
    finish()
    expect(unread()).toBe(1)
    act(() => useSupervisionStore.setState({ missionControlOpen: false }))
    expect(unread()).toBe(0)
  })
})
