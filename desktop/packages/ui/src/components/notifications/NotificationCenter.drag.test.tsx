import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { shouldStartWindowDrag } from "@/lib/windowDrag"

const { NotificationCenter } = await import("./NotificationCenter")
const { useNotificationStore } = await import("@/stores/useNotificationStore")

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  useNotificationStore.setState({ notifications: [], isOpen: true })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useNotificationStore.setState({ notifications: [], isOpen: false })
})

test("presses on the backdrop and the panel are not window drags, so a second click on the bell closes the panel", async () => {
  const starts: boolean[] = []
  await act(async () => {
    root.render(
      <I18nProvider>
        <div onMouseDown={(event) => starts.push(shouldStartWindowDrag(event.target as Element, event.button))}>
          <NotificationCenter />
        </div>
      </I18nProvider>,
    )
  })
  const backdrop = container.querySelector<HTMLElement>(".fixed.inset-0")!
  const panel = container.querySelector<HTMLElement>('[role="dialog"]')!
  await act(async () => {
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    panel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
  })
  expect(starts).toEqual([false, false])

  await act(async () => backdrop.click())
  expect(useNotificationStore.getState().isOpen).toBe(false)
})

test("lists follow-ups without answer buttons and marks them read when the panel closes", async () => {
  const store = useNotificationStore.getState()
  store.addNotification({ type: "session", title: "Run finished", message: "Fix login", sessionId: "ses_1" })
  store.addNotification({ type: "system", title: "Run failed", message: "Build docs" })
  store.setOpen(true)
  await act(async () => {
    root.render(
      <I18nProvider>
        <NotificationCenter />
      </I18nProvider>,
    )
  })
  const panel = container.querySelector<HTMLElement>('[role="dialog"]')!
  expect(panel.textContent).toContain("Run finished")
  expect(panel.textContent).toContain("Run failed")
  // Two header actions (mark all read, clear all) and the session row, which only opens its session: nothing in the
  // panel answers a request.
  const buttons = [...panel.querySelectorAll("button")]
  expect(buttons).toHaveLength(3)
  expect(buttons.filter((button) => button.textContent?.includes("Run finished"))).toHaveLength(1)
  expect(buttons.some((button) => /allow|deny|answer|approve/i.test(button.textContent ?? ""))).toBe(false)
  expect(useNotificationStore.getState().notifications.filter((item) => !item.read)).toHaveLength(2)
  await act(async () => useNotificationStore.getState().setOpen(false))
  expect(useNotificationStore.getState().notifications.every((item) => item.read)).toBe(true)
})
