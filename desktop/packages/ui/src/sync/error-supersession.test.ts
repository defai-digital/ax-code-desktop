import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { Event } from "@defai-digital/ax-code-sdk/v2/client"

import { ChildStoreManager } from "./child-store"
import { createEventRoutingIndex } from "./event-routing"
import { appendNotification, useSyncNotificationStore } from "./notification-store"
import { takeSessionRunStartedAt } from "./run-start-tracker"
import { handleEvent } from "./sync-context-impl"

const event = (type: string, properties: unknown): Event => ({ type, properties }) as Event

let manager: ChildStoreManager
let routing: ReturnType<typeof createEventRoutingIndex>
const send = (type: string, properties: unknown) => handleEvent("/repo", event(type, properties), manager, routing)
const hasError = () => useSyncNotificationStore.getState().sessionHasError("ses_1")
const seedError = (age: number) =>
  appendNotification({ type: "error", directory: "/repo", session: "ses_1", time: Date.now() - age, viewed: false })

beforeEach(() => {
  manager = new ChildStoreManager()
  manager.ensureChild("/repo", { bootstrap: false })
  routing = createEventRoutingIndex()
  takeSessionRunStartedAt("ses_1")
})
afterEach(() => {
  useSyncNotificationStore.setState({
    list: [],
    index: { session: { unseenCount: {}, unseenHasError: {} }, project: { unseenCount: {}, unseenHasError: {} } },
  })
})

describe("a later completed run supersedes an unseen error", () => {
  test("an error from before the run began is cleared when that run goes idle", () => {
    seedError(60_000)
    expect(hasError()).toBe(true)
    send("session.status", { sessionID: "ses_1", status: { type: "busy" } })
    expect(hasError()).toBe(true)
    send("session.idle", { sessionID: "ses_1" })
    expect(hasError()).toBe(false)
  })

  test("an error raised inside the run that just ended stays", () => {
    send("session.status", { sessionID: "ses_1", status: { type: "busy" } })
    send("session.error", { sessionID: "ses_1", error: { message: "boom" } })
    send("session.idle", { sessionID: "ses_1" })
    expect(hasError()).toBe(true)
  })

  test("a run that was not observed from its start never clears an error", () => {
    seedError(60_000)
    send("session.idle", { sessionID: "ses_1" })
    expect(hasError()).toBe(true)
  })
})
