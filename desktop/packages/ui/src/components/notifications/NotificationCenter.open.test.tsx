import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const mocks = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: mocks.open }))

const { NotificationCenter } = await import("./NotificationCenter")
const { useNotificationStore } = await import("@/stores/useNotificationStore")

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useNotificationStore.setState({ notifications: [], isOpen: false })
  vi.clearAllMocks()
})

const entry = (overrides: Record<string, unknown>) => ({
  id: String(overrides.title),
  type: "session" as const,
  message: "",
  timestamp: Date.now(),
  read: false,
  title: "",
  ...overrides,
})

test("a follow-up row opens its session in its project and closes the panel", async () => {
  useNotificationStore.setState({
    isOpen: true,
    notifications: [
      entry({ title: "Run failed", sessionId: "ses_1", projectId: "proj", directory: "/work/wiki" }),
      entry({ title: "Update ready", type: "system" }),
    ],
  })
  await act(async () => {
    root.render(
      <I18nProvider>
        <NotificationCenter />
      </I18nProvider>,
    )
  })

  const rows = [...container.querySelectorAll("button")].filter((button) => button.textContent?.includes("Run failed"))
  expect(rows).toHaveLength(1)
  // A notice with no session has nothing to open.
  expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Update ready"))).toBe(
    false,
  )

  await act(async () => rows[0]!.click())

  expect(mocks.open).toHaveBeenCalledWith({ sessionId: "ses_1", projectId: "proj", directory: "/work/wiki" })
  expect(useNotificationStore.getState().isOpen).toBe(false)
})
