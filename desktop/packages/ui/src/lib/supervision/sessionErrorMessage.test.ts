import { describe, expect, test } from "vitest"

import { latestUnseenSessionErrorMessage, type SessionErrorNotificationLike } from "./sessionErrorMessage"

const errorAt = (overrides: Partial<SessionErrorNotificationLike> = {}): SessionErrorNotificationLike => ({
  type: "error",
  session: "s1",
  viewed: false,
  time: 10,
  error: { message: "Build failed" },
  ...overrides,
})

describe("latestUnseenSessionErrorMessage", () => {
  test("returns the message of an unseen error notification for the session", () => {
    expect(latestUnseenSessionErrorMessage([errorAt()], "s1")).toBe("Build failed")
  })

  test("ignores viewed, other-session, and non-error notifications", () => {
    const notifications = [
      errorAt({ viewed: true }),
      errorAt({ session: "other" }),
      errorAt({ type: "turn-complete" }),
    ]
    expect(latestUnseenSessionErrorMessage(notifications, "s1")).toBeUndefined()
  })

  test("ignores missing, empty, and whitespace-only messages", () => {
    const notifications = [
      errorAt({ error: {} }),
      errorAt({ error: { message: "" } }),
      errorAt({ error: { message: "   " } }),
      errorAt({ error: undefined }),
    ]
    expect(latestUnseenSessionErrorMessage(notifications, "s1")).toBeUndefined()
  })

  test("returns the trimmed message", () => {
    expect(latestUnseenSessionErrorMessage([errorAt({ error: { message: "  Boom  " } })], "s1")).toBe("Boom")
  })

  test("picks the newest time, treating a missing time as 0", () => {
    const notifications = [
      errorAt({ time: 5, error: { message: "older" } }),
      errorAt({ time: undefined, error: { message: "no time" } }),
      errorAt({ time: 20, error: { message: "newest" } }),
    ]
    expect(latestUnseenSessionErrorMessage(notifications, "s1")).toBe("newest")
  })

  test("breaks a time tie by later array index", () => {
    const notifications = [
      errorAt({ time: 10, error: { message: "first" } }),
      errorAt({ time: 10, error: { message: "second" } }),
    ]
    expect(latestUnseenSessionErrorMessage(notifications, "s1")).toBe("second")
  })

  test("caps the message at 180 characters with an ellipsis", () => {
    const long = "x".repeat(200)
    const result = latestUnseenSessionErrorMessage([errorAt({ error: { message: long } })], "s1")
    expect(result).toHaveLength(180)
    expect(result).toBe(`${"x".repeat(179)}…`)
  })

  test("leaves a message of exactly 180 characters untouched", () => {
    const exact = "y".repeat(180)
    expect(latestUnseenSessionErrorMessage([errorAt({ error: { message: exact } })], "s1")).toBe(exact)
  })
})
