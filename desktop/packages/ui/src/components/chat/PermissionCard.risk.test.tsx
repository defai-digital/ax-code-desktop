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
  always: [] as string[],
}

describe("PermissionCard risk", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
  })

  const render = (
    permission: typeof request & { riskClass?: "safe" | "risk" | "unknown"; interactiveOnly?: boolean },
  ) =>
    React.act(() => {
      root.render(<PermissionCard permission={permission} />)
    })
  const buttonTexts = () => Array.from(container.querySelectorAll("button")).map((button) => button.textContent ?? "")
  const badge = () => container.querySelector("[data-request-risk]")

  test("badges a must-decide request and offers no allow-always", () => {
    render({ ...request, always: ["npm *"], riskClass: "risk", interactiveOnly: true })
    expect(badge()?.getAttribute("data-request-risk")).toBe("decide")
    expect(badge()?.textContent).toContain("permissionRisk.decide.label")
    expect(buttonTexts().some((text) => text.includes("chat.permissionCard.actions.allowOnce"))).toBe(true)
    expect(buttonTexts().some((text) => text.includes("alwaysPatterns") || text.includes("allowAlways"))).toBe(false)
  })

  test("badges a risky request and keeps allow-always", () => {
    render({ ...request, always: ["npm *"], riskClass: "risk", interactiveOnly: false })
    expect(badge()?.getAttribute("data-request-risk")).toBe("risk")
    expect(buttonTexts().some((text) => text.includes("chat.permissionCard.alwaysPatterns"))).toBe(true)
  })

  test("shows no badge for safe requests or a runtime that sends no class", () => {
    render({ ...request, riskClass: "safe" })
    expect(badge()).toBeNull()
    render(request)
    expect(badge()).toBeNull()
    expect(buttonTexts().some((text) => text.includes("chat.permissionCard.actions.allowAlways"))).toBe(true)
  })
})
