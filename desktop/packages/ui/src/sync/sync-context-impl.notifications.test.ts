import { afterEach, describe, expect, test } from "vitest"

import { ChildStoreManager } from "./child-store"
import { createEventRoutingIndex } from "./event-routing"
import { useSyncNotificationStore } from "./notification-store"
import { handleEvent, setActiveSession } from "./sync-context-impl"

const sessionId = "ses_visible"

afterEach(() => {
  setActiveSession("", "")
  useSyncNotificationStore.setState(useSyncNotificationStore.getInitialState())
})

function completeSession(activeDirectory: string, eventDirectory: string, activeSessionId = sessionId) {
  const childStores = new ChildStoreManager()
  try {
    childStores.ensureChild(eventDirectory, { bootstrap: false })
    setActiveSession(activeDirectory, activeSessionId)
    handleEvent(
      eventDirectory,
      { type: "session.idle", properties: { sessionID: sessionId } },
      childStores,
      createEventRoutingIndex(),
    )
  } finally {
    childStores.disposeAll()
  }
  return useSyncNotificationStore.getState()
}

describe("viewed session completion notifications", () => {
  test.each([
    ["c:\\Work\\Project", "C:/work/project"],
    ["//Server/Share/Project", "//server/share/project"],
  ])(
    "marks a completion viewed when the active path %s and event path %s identify the same directory",
    (active, event) => {
      const notifications = completeSession(active, event)
      expect(notifications.list).toEqual([expect.objectContaining({ session: sessionId, viewed: true })])
      expect(notifications.sessionUnseenCount(sessionId)).toBe(0)
    },
  )

  test.each([
    ["C:/Work/Project", "C:/Work/Project-Other", sessionId],
    ["/Work/Project", "/work/project", sessionId],
    ["/repo", "/repo ", sessionId],
    ["C:/Work/Project", "C:/work/project", "ses_other"],
  ])("keeps the completion unread for a different directory or session (%s, %s, %s)", (active, event, session) => {
    const notifications = completeSession(active, event, session)
    expect(notifications.list).toEqual([expect.objectContaining({ session: sessionId, viewed: false })])
    expect(notifications.sessionUnseenCount(sessionId)).toBe(1)
  })
})
