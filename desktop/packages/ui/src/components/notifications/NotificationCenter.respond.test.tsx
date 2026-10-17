import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { NotificationCenter } = await import("./NotificationCenter")
const { useNotificationStore } = await import("@/stores/useNotificationStore")

const permissionItem = (overrides: Record<string, unknown>) => ({
  type: "permission" as const,
  title: "Run a command",
  message: "rm -rf build",
  sessionId: "ses_1",
  requestId: "req_1",
  toolName: "bash",
  ...overrides,
})

describe("NotificationCenter permission entry", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    // The panel renders only while it is open.
    useNotificationStore.setState({ notifications: [], isOpen: true })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useNotificationStore.setState({ notifications: [], isOpen: false })
  })

  const render = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <NotificationCenter />
        </I18nProvider>,
      )
    })
    await act(async () => {})
  }

  const click = async (label: string) => {
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .filter((button) => button.textContent === label)
        .forEach((button) => button.click())
    })
    await act(async () => {})
  }

  test("keeps the entry when the answer did not land", async () => {
    // The entry called the handler and removed itself straight away, so a reply that failed — the permission is
    // still pending — took the bell's only handle on it away, leaving an error toast and a request the user could
    // no longer answer from there.
    const onAllow = vi.fn(async () => {
      throw new Error("Failed to respond")
    })
    useNotificationStore.getState().addNotification(permissionItem({ onAllow, onDeny: onAllow }))
    await render()

    await click(dict["notificationCenter.allow"])

    expect(onAllow).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
  })

  test("submits one answer per request", async () => {
    // Waiting for the reply before removing the entry added no synchronous guard, so Allow and Deny could both be
    // submitted for one request while the first was in flight.
    let releaseReply = () => {}
    const onAllow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReply = resolve
        }),
    )
    const onDeny = vi.fn(async () => {})
    useNotificationStore.getState().addNotification(permissionItem({ onAllow, onDeny }))
    await render()

    // Both in one act, with no flush between them: the state guard alone let both through because `setState` is
    // async, which is what the permission card's ref exists for.
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .filter((button) => button.textContent === dict["notificationCenter.allow"])
        .forEach((button) => button.click())
      Array.from(container.querySelectorAll("button"))
        .filter((button) => button.textContent === dict["notificationCenter.deny"])
        .forEach((button) => button.click())
    })
    await act(async () => {})

    expect(onAllow).toHaveBeenCalledTimes(1)
    expect(onDeny).not.toHaveBeenCalled()
    releaseReply()
  })

  test("does not answer again after the panel is closed and reopened", async () => {
    // The guard lived in the entry, and the panel returns null while closed, so every close unmounted the entry and
    // the reopen mounted a fresh one with the guard reset — while the first answer was still in flight.
    let releaseReply = () => {}
    const onAllow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReply = resolve
        }),
    )
    const onDeny = vi.fn(async () => {})
    useNotificationStore.getState().addNotification(permissionItem({ onAllow, onDeny }))
    await render()

    await click(dict["notificationCenter.allow"])
    // Each toggle gets its own commit: the panel has to actually return null between them, which is what unmounts
    // the entry and resets a per-entry guard.
    await act(async () => {
      useNotificationStore.setState({ isOpen: false })
    })
    await act(async () => {
      useNotificationStore.setState({ isOpen: true })
    })
    await click(dict["notificationCenter.deny"])

    expect(onAllow).toHaveBeenCalledTimes(1)
    expect(onDeny).not.toHaveBeenCalled()
    releaseReply()
  })

  test("removes the entry once the answer landed", async () => {
    const onAllow = vi.fn(async () => {})
    useNotificationStore.getState().addNotification(permissionItem({ onAllow, onDeny: onAllow }))
    await render()

    await click(dict["notificationCenter.allow"])

    expect(onAllow).toHaveBeenCalledTimes(1)
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
})
