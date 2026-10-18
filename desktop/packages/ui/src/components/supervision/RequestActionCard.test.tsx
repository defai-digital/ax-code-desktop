import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { PendingRequestEntry } from "@/sync/sync-context"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/sync/session-actions", () => ({
  respondToPermission: vi.fn(),
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
}))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn() } }))
import * as actions from "@/sync/session-actions"
import { toast } from "@/components/ui"
import { RequestActionCard } from "./RequestActionCard"

const permission = (patterns: string[], id = "per_1"): PendingRequestEntry => ({
  kind: "permission",
  sessionId: "ses_1",
  request: { id, sessionID: "ses_1", permission: "bash", patterns, always: [], metadata: {} },
})

describe("cross-session request decisions", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.resetAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const render = (entry: PendingRequestEntry) =>
    act(() =>
      root.render(
        <React.StrictMode>
          <RequestActionCard entry={entry} density="compact" />
        </React.StrictMode>,
      ),
    )
  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label))!

  test("reveals every scope verbatim, excludes blank patterns, and resets disclosure for a new request", () => {
    const patterns = ["git status", "", "git diff", `/workspace/${"long-path-".repeat(40)}*`]
    render(permission(patterns))
    expect(button("scopeCount").textContent).toContain('"count":3')
    expect(container.textContent).not.toContain(patterns[3])
    act(() => button("scopeCount").click())
    expect(button("scopeCount").getAttribute("aria-expanded")).toBe("true")
    expect(Array.from(container.querySelectorAll("li code")).map((n) => n.textContent)).toEqual(
      patterns.filter(Boolean),
    )
    render(permission(patterns, "per_2"))
    expect(button("scopeCount").getAttribute("aria-expanded")).toBe("false")
    expect(button("notificationCenter.allow").disabled).toBe(false)
    expect(button("notificationCenter.deny").disabled).toBe(false)
  })

  test("a single long scope has a disclosure; short scopes remain fully visible", () => {
    render(permission(["x".repeat(500)]))
    expect(button("scopeCount").textContent).toContain('"count":1')
    act(() => button("scopeCount").click())
    expect(container.querySelector("code")?.textContent).toBe("x".repeat(500))
    render(permission(["git status"], "per_2"))
    expect(container.querySelector("[aria-expanded]")).toBeNull()
    expect(container.querySelector("code")?.textContent).toBe("git status")
  })

  test("does not offer disclosure when two scopes are already visible in full", () => {
    const patterns = ["a".repeat(100), "b".repeat(100)]
    render(permission(patterns))
    expect(container.querySelector("[aria-expanded]")).toBeNull()
    expect(Array.from(container.querySelectorAll("code")).map((node) => node.textContent)).toEqual(patterns)
  })

  test("same-tick repeated decisions send once, recover on failure, and work in StrictMode", async () => {
    let reject!: (reason: Error) => void
    vi.mocked(actions.respondToPermission).mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    render(permission(["a", "b", "c"]))
    act(() => {
      button("notificationCenter.allow").click()
      button("notificationCenter.allow").click()
    })
    expect(actions.respondToPermission).toHaveBeenCalledExactlyOnceWith("ses_1", "per_1", "once")
    expect(button("notificationCenter.deny").disabled).toBe(true)
    await act(async () => {
      reject(new Error("Try again"))
    })
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(button("notificationCenter.deny").disabled).toBe(false)
    await act(async () => button("notificationCenter.deny").click())
    expect(actions.respondToPermission).toHaveBeenLastCalledWith("ses_1", "per_1", "reject")
  })

  test("single-choice questions still answer and dismiss with the original payload", async () => {
    render({
      kind: "question",
      sessionId: "ses_1",
      request: {
        id: "q1",
        sessionID: "ses_1",
        questions: [
          {
            header: "Choose",
            question: "Which?",
            options: [{ label: "Blue", description: "Use blue" }],
            multiple: false,
          },
        ],
      },
    })
    expect(container.querySelector("[aria-expanded]")).toBeNull()
    await act(async () => button("Blue").click())
    expect(actions.respondToQuestion).toHaveBeenCalledWith("ses_1", "q1", [["Blue"]])
    await act(async () => button("supervision.request.dismiss").click())
    expect(actions.rejectQuestion).toHaveBeenCalledWith("ses_1", "q1")
  })
})
