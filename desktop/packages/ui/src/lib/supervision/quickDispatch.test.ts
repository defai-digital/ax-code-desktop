import { describe, expect, test } from "vitest"

import {
  createDispatchToken,
  dispatchStillShowingAttempt,
  planQuickDispatchCompletion,
  planQuickDispatchFailure,
  quickDispatchSessionLabel,
  reduceDispatchToken,
} from "./quickDispatch"

const known = new Set(["previous", "other"])

describe("reduceDispatchToken", () => {
  test("records the first unknown session as the one this attempt created", () => {
    const drafted = reduceDispatchToken(createDispatchToken(), null, known)
    const created = reduceDispatchToken(drafted, "created", known)
    expect(created).toEqual({ createdSessionId: "created", superseded: false })
    expect(reduceDispatchToken(created, "created", known)).toEqual(created)
  })

  test("an existing session, or leaving the created one, means the user took the view", () => {
    const drafted = reduceDispatchToken(createDispatchToken(), null, known)
    expect(reduceDispatchToken(drafted, "other", known)).toEqual({ createdSessionId: null, superseded: true })

    const created = reduceDispatchToken(drafted, "created", known)
    expect(reduceDispatchToken(created, "other", known)).toEqual({ createdSessionId: "created", superseded: true })
    expect(reduceDispatchToken(created, null, known).superseded).toBe(true)
  })

  test("still remembers the created session when the user navigated before it existed", () => {
    const navigated = reduceDispatchToken(createDispatchToken(), "other", known)
    const created = reduceDispatchToken(navigated, "created", known)
    expect(created).toEqual({ createdSessionId: "created", superseded: true })
  })
})

describe("dispatch view plans", () => {
  test("restores only while the created session or the draft is still on screen", () => {
    const token = { createdSessionId: "created", superseded: false }
    expect(dispatchStillShowingAttempt(token, { sessionId: "created", draftOpen: false })).toBe(true)
    expect(dispatchStillShowingAttempt(token, { sessionId: "other", draftOpen: false })).toBe(false)
    expect(
      dispatchStillShowingAttempt({ createdSessionId: null, superseded: false }, { sessionId: null, draftOpen: true }),
    ).toBe(true)
    expect(
      dispatchStillShowingAttempt(
        { createdSessionId: "created", superseded: true },
        { sessionId: "created", draftOpen: false },
      ),
    ).toBe(false)

    expect(
      planQuickDispatchCompletion({ openAfter: false, createdSessionId: "created", showingAttempt: true }),
    ).toEqual({ type: "restore" })
    expect(planQuickDispatchCompletion({ openAfter: true, createdSessionId: "created", showingAttempt: true })).toEqual(
      { type: "open", sessionId: "created" },
    )
    expect(
      planQuickDispatchCompletion({ openAfter: false, createdSessionId: "created", showingAttempt: false }),
    ).toEqual({ type: "leave" })
  })

  test("a created session is reported instead of a plain failure that would hide it", () => {
    expect(
      planQuickDispatchFailure({
        noModel: false,
        createdSessionId: "created",
        superseded: false,
        currentSessionId: "created",
      }),
    ).toEqual({ restore: false, report: "created" })
    expect(
      planQuickDispatchFailure({
        noModel: false,
        createdSessionId: "created",
        superseded: true,
        currentSessionId: "other",
      }),
    ).toEqual({ restore: false, report: "created" })
  })

  test("a failure before a session exists restores only the empty draft view", () => {
    expect(
      planQuickDispatchFailure({
        noModel: true,
        createdSessionId: null,
        superseded: false,
        currentSessionId: null,
      }),
    ).toEqual({ restore: true, report: "no-model" })
    expect(
      planQuickDispatchFailure({
        noModel: false,
        createdSessionId: null,
        superseded: true,
        currentSessionId: "other",
      }),
    ).toEqual({ restore: false, report: "failed" })
    expect(
      planQuickDispatchFailure({
        noModel: false,
        createdSessionId: null,
        superseded: false,
        currentSessionId: null,
      }),
    ).toEqual({ restore: true, report: "failed" })
  })
})

describe("quickDispatchSessionLabel", () => {
  test("uses the title, then the prompt, then the id", () => {
    expect(quickDispatchSessionLabel({ title: "  Rename the parser  ", prompt: "ignored", sessionId: "ses" })).toBe(
      "Rename the parser",
    )
    expect(quickDispatchSessionLabel({ title: " ", prompt: "Fix the flaky test\nmore", sessionId: "ses" })).toBe(
      "Fix the flaky test",
    )
    const long = "x".repeat(90)
    expect(quickDispatchSessionLabel({ title: null, prompt: long, sessionId: "ses" })).toBe(`${"x".repeat(79)}…`)
    expect(quickDispatchSessionLabel({ title: null, prompt: "   ", sessionId: "ses_1" })).toBe("ses_1")
  })
})
