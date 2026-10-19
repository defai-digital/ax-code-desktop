import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { respondToPermission } = vi.hoisted(() => ({
  respondToPermission: vi.fn(async () => undefined),
}))

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
vi.mock("@/sync/session-actions", () => ({ respondToPermission }))
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
  patterns: ["git status"],
  metadata: { command: "git status" },
  always: [] as string[],
}

describe("PermissionCard allow-always rule", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    respondToPermission.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (permission: typeof request) =>
    act(() => {
      root.render(<PermissionCard permission={permission} />)
    })

  const buttonWith = (needle: string) =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(needle))

  const expectNoEditablePattern = () => {
    expect(container.querySelector("input")).toBeNull()
    expect(buttonWith("chat.permissionCard.patternBuilder.custom")).toBeUndefined()
  }

  test("sends always directly instead of collecting a pattern the reply cannot carry", async () => {
    render({ ...request, always: [] })
    const allowAlways = buttonWith("chat.permissionCard.actions.allowAlways")
    if (!allowAlways) throw new Error("allow-always button not found")
    expectNoEditablePattern()

    await act(async () => {
      allowAlways.click()
    })

    expect(respondToPermission).toHaveBeenCalledWith("ses_1", "per_1", "always")
  })

  test("states the server-provided always rule and applies it directly", async () => {
    render({ ...request, always: ["git status"] })
    const allowAlways = buttonWith("chat.permissionCard.alwaysPatterns")
    if (!allowAlways) throw new Error("allow-always button not found")
    expect(allowAlways.textContent).toContain("git status")
    expectNoEditablePattern()

    await act(async () => {
      allowAlways.click()
    })

    expect(respondToPermission).toHaveBeenCalledWith("ses_1", "per_1", "always")
  })
})
