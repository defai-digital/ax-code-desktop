import { afterEach, describe, expect, test } from "vitest"

import { appendNotification, clearSessionErrorsBefore, useSyncNotificationStore } from "./notification-store"

const error = (session: string, time: number) =>
  appendNotification({ type: "error", directory: "/repo", session, time: Date.now() + time, viewed: false })
const hasError = (session: string) => useSyncNotificationStore.getState().sessionHasError(session)

afterEach(() => {
  useSyncNotificationStore.setState({
    list: [],
    index: {
      session: { unseenCount: {}, unseenHasError: {} },
      project: { unseenCount: {}, unseenHasError: {} },
    },
  })
})

describe("clearSessionErrorsBefore", () => {
  test("clears an error from before the cutoff and leaves one raised after it", () => {
    const base = Date.now()
    error("s", 0)
    error("s", 1000)
    clearSessionErrorsBefore("s", base + 500)
    expect(hasError("s")).toBe(true)
    expect(useSyncNotificationStore.getState().list.filter((n) => n.viewed)).toHaveLength(1)

    clearSessionErrorsBefore("s", base + 5000)
    expect(hasError("s")).toBe(false)
  })

  test("only touches the named session and leaves its non-error notifications unseen", () => {
    const base = Date.now()
    error("s", 0)
    error("other", 0)
    appendNotification({ type: "turn-complete", directory: "/repo", session: "s", time: base, viewed: false })
    clearSessionErrorsBefore("s", base + 5000)
    expect(hasError("s")).toBe(false)
    expect(hasError("other")).toBe(true)
    expect(useSyncNotificationStore.getState().sessionUnseenCount("s")).toBe(1)
  })

  test("does nothing for a session with no unseen error", () => {
    const before = useSyncNotificationStore.getState().list
    clearSessionErrorsBefore("quiet", Date.now() + 1000)
    expect(useSyncNotificationStore.getState().list).toBe(before)
  })
})
