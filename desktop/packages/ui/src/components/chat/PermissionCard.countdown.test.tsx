import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/sync/sync-context", () => ({ useSessions: () => [] }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: { currentSessionId: string }) => unknown) =>
    selector({ currentSessionId: "ses_1" }),
}))
vi.mock("@/sync/session-actions", () => ({ respondToPermission: vi.fn(async () => undefined) }))
vi.mock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ currentTheme: {} }) }))
vi.mock("@/lib/theme/syntaxThemeGenerator", () => ({ generateSyntaxTheme: () => ({}) }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { PermissionCard } from "./PermissionCard"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const request = {
  id: "per_1",
  sessionID: "ses_1",
  permission: "bash",
  patterns: ["npm test"],
  metadata: { command: "npm test" },
  always: [],
}

describe("PermissionCard idle allow-once countdown", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-13T00:00:00Z"))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const allowOnceLabel = () =>
    Array.from(container.querySelectorAll("button"))
      .map((button) => button.textContent ?? "")
      .find((text) => text.includes("chat.permissionCard.actions.allowOnce"))

  test("renders the remaining seconds from the runtime's autoOnceAt and keeps ticking", () => {
    const autoOnceAt = Date.now() + 15_000
    React.act(() => {
      root.render(<PermissionCard permission={{ ...request, autoOnceAt }} />)
    })
    expect(allowOnceLabel()).toContain('chat.permissionCard.actions.allowOnceCountdown:{"seconds":15}')
    React.act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(allowOnceLabel()).toContain('chat.permissionCard.actions.allowOnceCountdown:{"seconds":12}')
  })

  test("falls back to the plain label when the runtime did not stamp a deadline", () => {
    React.act(() => {
      root.render(<PermissionCard permission={request} />)
    })
    expect(allowOnceLabel()).toBe("chat.permissionCard.actions.allowOnce")
  })

  test("drops the countdown when a re-published ask removes the deadline", () => {
    React.act(() => {
      root.render(<PermissionCard permission={{ ...request, autoOnceAt: Date.now() + 15_000 }} />)
    })
    React.act(() => {
      root.render(<PermissionCard permission={{ ...request }} />)
    })
    expect(allowOnceLabel()).toBe("chat.permissionCard.actions.allowOnce")
  })
})
