import { afterEach, describe, expect, it, vi } from "vitest"

import { createNotificationTriggerRuntime } from "./runtime.js"

const createRuntime = (overrides = {}) => {
  const emitted = []
  const broadcast = []
  const runtime = createNotificationTriggerRuntime({
    readSettingsFromDisk: vi.fn(async () => ({
      nativeNotificationsEnabled: true,
      notificationMode: "always",
    })),
    prepareNotificationLastMessage: vi.fn(async ({ message }) => message || ""),
    buildTemplateVariables: vi.fn(async () => {
      throw new Error("skip custom template resolution")
    }),
    extractLastMessageText: vi.fn(() => ""),
    fetchLastAssistantMessageText: vi.fn(async () => ""),
    resolveNotificationTemplate: vi.fn((template) => template || ""),
    shouldApplyResolvedTemplateMessage: vi.fn(() => false),
    emitDesktopNotification: vi.fn((payload) => emitted.push(payload)),
    broadcastUiNotification: vi.fn((payload) => broadcast.push(payload)),
    buildAxCodeUrl: vi.fn((path) => path),
    getAxCodeAuthHeaders: vi.fn(() => ({})),
    ...overrides,
  })
  return { runtime, emitted, broadcast }
}

describe("notification trigger runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("formats default completion notification mode and model labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        body: { cancel: vi.fn() },
      })),
    )
    const { runtime, emitted, broadcast } = createRuntime()

    await runtime.maybeDispatchNotificationForTrigger({
      type: "message.updated",
      properties: {
        info: {
          id: "msg_test",
          sessionID: "ses_test",
          role: "assistant",
          finish: "stop",
          mode: "debug-agent",
          modelID: "glm-5-1-air",
        },
      },
    })

    expect(emitted).toEqual([
      expect.objectContaining({
        title: "Debug Agent agent is ready",
        body: "Glm 5.1 Air completed the task",
        kind: "ready",
        sessionId: "ses_test",
      }),
    ])
    expect(broadcast).toEqual(emitted)
  })

  it("trims question notification header and body text", async () => {
    vi.useFakeTimers()
    const { runtime, emitted, broadcast } = createRuntime()

    try {
      await runtime.maybeDispatchNotificationForTrigger({
        type: "question.asked",
        properties: {
          sessionID: "ses_question",
          questions: [
            {
              header: " Plan Mode ",
              question: " Continue with plan? ",
            },
          ],
        },
      })

      await vi.advanceTimersByTimeAsync(500)

      expect(emitted).toEqual([
        expect.objectContaining({
          kind: "question",
          title: "Switch to plan mode",
          body: "Continue with plan?",
          sessionId: "ses_question",
        }),
      ])
      expect(broadcast).toEqual(emitted)
    } finally {
      vi.useRealTimers()
    }
  })
})

  it("caches a root session's no-parent answer instead of re-fetching the list", async () => {
    const sessionListFetches = vi.fn(async () => ({
      ok: true,
      json: async () => [{ id: "ses_root", parentID: null }],
      body: { cancel: async () => {} },
    }))
    vi.stubGlobal("fetch", sessionListFetches)

    const { runtime } = createRuntime({
      readSettingsFromDisk: vi.fn(async () => ({
        nativeNotificationsEnabled: true,
        notificationMode: "always",
        notifyOnSubtasks: false,
        notifyOnCompletion: true,
      })),
    })

    const trigger = {
      type: "message.updated",
      properties: { info: { role: "assistant", finish: "stop", sessionID: "ses_root" } },
    }

    // Two completion triggers for the same root session: the parent lookup must be
    // served from the cache the second time, not by another full session-list fetch.
    await runtime.maybeDispatchNotificationForTrigger(trigger)
    await runtime.maybeDispatchNotificationForTrigger(trigger)

    expect(sessionListFetches).toHaveBeenCalledTimes(1)
  })

  it("notifies every permission ask in a burst instead of dropping the earlier ones", async () => {
    // Two parallel asks within one debounce window used to leave only the second one
    // told; the first sat pending with no prompt.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [],
        body: { cancel: async () => {} },
      })),
    )
    vi.useFakeTimers()
    try {
      const { runtime, emitted } = createRuntime()
      const ask = (id) => ({
        type: "permission.asked",
        properties: { id, permission: "bash", sessionTitle: "My session", sessionID: "ses_a" },
      })

      await runtime.maybeDispatchNotificationForTrigger(ask("req_a"))
      await runtime.maybeDispatchNotificationForTrigger(ask("req_b"))

      await vi.advanceTimersByTimeAsync(600)

      const tags = emitted.map((entry) => entry.tag)
      expect(tags).toContain("permission-ses_a:req_a")
      expect(tags).toContain("permission-ses_a:req_b")
    } finally {
      vi.useRealTimers()
    }
  })

it("notifies every unkeyed permission ask in a burst, not only the last", async () => {
  // A runtime that omits the ask's id (the reply handler documents that this happens) sent every ask in
  // the window to one constant key, so the map that exists to keep a burst intact held a single entry and
  // the earlier prompt was never announced.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [],
      body: { cancel: async () => {} },
    })),
  )
  vi.useFakeTimers()
  try {
    const { runtime, emitted } = createRuntime()
    const ask = () => ({
      type: "permission.asked",
      properties: { permission: "bash", sessionTitle: "My session", sessionID: "ses_a" },
    })

    await runtime.maybeDispatchNotificationForTrigger(ask())
    await runtime.maybeDispatchNotificationForTrigger(ask())

    await vi.advanceTimersByTimeAsync(600)

    expect(emitted.filter((entry) => String(entry.tag).startsWith("permission-"))).toHaveLength(2)
  } finally {
    vi.useRealTimers()
  }
})

it("does not notify for an ask the user answered while the flush was running", async () => {
  // The flush deletes its debounce entry before it starts awaiting, so a reply that lands in that
  // window found nothing to cancel: the prompt was announced after the user had answered it.
  let releaseTemplate = () => {}
  const templateGate = new Promise((resolve) => {
    releaseTemplate = resolve
  })

  vi.useFakeTimers()
  try {
    const { runtime, emitted } = createRuntime({
      buildTemplateVariables: vi.fn(async () => {
        await templateGate
        throw new Error("late template failure")
      }),
    })

    await runtime.maybeDispatchNotificationForTrigger({
      type: "permission.asked",
      properties: { id: "req_gate", permission: "bash", sessionTitle: "My session", sessionID: "ses_g" },
    })
    // The debounce timer fires and the flush suspends inside the template variables.
    await vi.advanceTimersByTimeAsync(600)

    await runtime.maybeDispatchNotificationForTrigger({
      type: "permission.replied",
      properties: { requestID: "req_gate", sessionID: "ses_g" },
    })

    releaseTemplate()
    await vi.advanceTimersByTimeAsync(50)

    expect(emitted.map((entry) => entry.tag)).not.toContain("permission-ses_g:req_gate")
  } finally {
    vi.useRealTimers()
  }
})

it("drops only the replied permission ask and still notifies the pending ones", async () => {
  // A reply used to clear the whole session debounce entry, so every other ask
  // waiting in the same window lost its notification.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [],
      body: { cancel: async () => {} },
    })),
  )
  vi.useFakeTimers()
  try {
    const { runtime, emitted } = createRuntime()
    const ask = (id) => ({
      type: "permission.asked",
      properties: { id, permission: "bash", sessionTitle: "My session", sessionID: "ses_r" },
    })

    await runtime.maybeDispatchNotificationForTrigger(ask("req_a"))
    await runtime.maybeDispatchNotificationForTrigger(ask("req_b"))
    await runtime.maybeDispatchNotificationForTrigger({
      type: "permission.replied",
      properties: { requestID: "req_a", sessionID: "ses_r" },
    })

    await vi.advanceTimersByTimeAsync(600)

    const tags = emitted.map((entry) => entry.tag)
    expect(tags).not.toContain("permission-ses_r:req_a")
    expect(tags).toContain("permission-ses_r:req_b")
  } finally {
    vi.useRealTimers()
  }
})

describe("notification debounce failure handling", () => {
  // A rejecting settings read inside the timer body had nothing to report it to: the handle
  // only ever reaches clearTimeout, so the rejection escaped the timer and Node's default
  // (`--unhandled-rejections=throw`) took the whole server process down with every open
  // session and terminal.
  const watchUnhandledRejections = () => {
    const rejections = []
    const listener = (reason) => rejections.push(reason)
    process.on("unhandledRejection", listener)
    return {
      rejections,
      stop: () => process.off("unhandledRejection", listener),
    }
  }

  const settle = async () => {
    await new Promise((resolve) => process.nextTick(resolve))
    await Promise.resolve()
  }

  it("keeps a failed settings read inside the debounced question ask", async () => {
    vi.useFakeTimers()
    const watcher = watchUnhandledRejections()
    try {
      const { runtime, emitted } = createRuntime({
        readSettingsFromDisk: vi.fn(async () => {
          throw new Error("settings.json is unreadable")
        }),
      })

      await runtime.maybeDispatchNotificationForTrigger({
        type: "question.asked",
        properties: { sessionID: "ses_q1", questions: [{ header: "Plan Mode", question: "Continue?" }] },
      })
      await vi.advanceTimersByTimeAsync(600)
      await settle()

      expect(emitted).toEqual([])
      expect(watcher.rejections).toEqual([])
    } finally {
      watcher.stop()
      vi.useRealTimers()
    }
  })

  it("keeps a failed settings read inside the debounced permission ask", async () => {
    vi.useFakeTimers()
    const watcher = watchUnhandledRejections()
    try {
      const { runtime, emitted } = createRuntime({
        readSettingsFromDisk: vi.fn(async () => {
          throw new Error("settings.json is unreadable")
        }),
      })

      await runtime.maybeDispatchNotificationForTrigger({
        type: "permission.asked",
        properties: { id: "req_p1", permission: "bash", sessionTitle: "My session", sessionID: "ses_p1" },
      })
      await vi.advanceTimersByTimeAsync(600)
      await settle()

      expect(emitted).toEqual([])
      expect(watcher.rejections).toEqual([])
    } finally {
      watcher.stop()
      vi.useRealTimers()
    }
  })
})
