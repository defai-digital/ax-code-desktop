import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { PendingRequestEntry } from "@/sync/sync-context"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/sync/session-actions", () => ({ captureBlockingRequest: vi.fn() }))
import * as actions from "@/sync/session-actions"
import { useRequestDecisionStore } from "@/stores/useRequestDecisionStore"
import { RequestActionCard } from "./RequestActionCard"

const source = { respond: vi.fn(), read: vi.fn(), isPendingLocally: () => true }
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
    useRequestDecisionStore.setState({ records: new Map() })
    source.respond.mockResolvedValue(undefined)
    source.read.mockResolvedValue("pending")
    vi.mocked(actions.captureBlockingRequest).mockReturnValue(source)
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
    expect(button("supervision.request.allowOnce").disabled).toBe(false)
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
    source.respond.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    render(permission(["a", "b", "c"]))
    act(() => {
      button("supervision.request.allowOnce").click()
      button("supervision.request.allowOnce").click()
    })
    expect(source.respond).toHaveBeenCalledExactlyOnceWith("once")
    expect(button("notificationCenter.deny").disabled).toBe(true)
    await act(async () => {
      reject(new Error("Try again"))
    })
    expect(source.read).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="status"]')?.textContent).toContain("status.retry")
    expect(container.textContent).not.toContain("Try again")
    expect(button("notificationCenter.deny").disabled).toBe(false)
    await act(async () => button("notificationCenter.deny").click())
    expect(source.respond).toHaveBeenLastCalledWith("reject")
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
    expect(source.respond).toHaveBeenCalledWith([["Blue"]])
    expect(button("supervision.request.dismiss").disabled).toBe(true)
    act(() => useRequestDecisionStore.setState({ records: new Map() }))
    await act(async () => button("supervision.request.dismiss").click())
    expect(source.respond).toHaveBeenCalledWith("reject")
  })
  test("successful responses stay locked until canonical removal, including a remount", async () => {
    render(permission(["git status"]))
    await act(async () => button("supervision.request.allowOnce").click())
    expect(container.textContent).toContain("status.accepted")
    expect(button("notificationCenter.deny").disabled).toBe(true)
    expect(source.read).not.toHaveBeenCalled()
    act(() => root.render(null))
    render(permission(["git status"]))
    await act(async () => button("notificationCenter.deny").click())
    expect(source.respond).toHaveBeenCalledTimes(1)
  })

  test("two surfaces cannot submit conflicting decisions in the same tick", async () => {
    source.respond.mockReturnValueOnce(new Promise(() => {}))
    const entry = permission(["git status"])
    act(() =>
      root.render(
        <>
          <RequestActionCard entry={entry} />
          <RequestActionCard entry={entry} />
        </>,
      ),
    )
    act(() => {
      button("supervision.request.allowOnce").click()
      Array.from(container.querySelectorAll("button"))
        .reverse()
        .find((b) => b.textContent?.includes("notificationCenter.deny"))!
        .click()
    })
    expect(source.respond).toHaveBeenCalledExactlyOnceWith("once")
    expect(
      Array.from(container.querySelectorAll("[data-request-status]")).map((e) => e.getAttribute("data-request-status")),
    ).toEqual(["sending", "sending"])
  })

  test("uncertain failure requires a read-only status check before retry", async () => {
    source.respond.mockRejectedValueOnce(new Error("secret endpoint token"))
    source.read.mockRejectedValueOnce(new Error("offline"))
    render(permission(["git status"]))
    await act(async () => button("supervision.request.allowOnce").click())
    expect(container.textContent).toContain("status.uncertain")
    expect(container.textContent).not.toContain("secret")
    expect(button("notificationCenter.deny").disabled).toBe(true)
    await act(async () => {
      button("checkStatus").click()
      button("checkStatus").click()
    })
    expect(source.read).toHaveBeenCalledTimes(2)
    expect(source.respond).toHaveBeenCalledTimes(1)
    expect(button("notificationCenter.deny").disabled).toBe(false)
  })

  test("a resolved request cannot be retried after an ambiguous response", async () => {
    source.respond.mockRejectedValueOnce(new Error("lost reply"))
    source.read.mockResolvedValueOnce("resolved")
    render(permission(["git status"]))
    await act(async () => button("supervision.request.allowOnce").click())
    expect(container.textContent).toContain("status.resolved")
    expect(button("notificationCenter.deny").disabled).toBe(true)
  })

  test("late failure does not affect a replacement request or an unmounted card", async () => {
    let fail!: (error: Error) => void
    source.respond.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject
      }),
    )
    render(permission(["git status"]))
    act(() => button("supervision.request.allowOnce").click())
    render(permission(["git diff"], "per_2"))
    await act(async () => fail(new Error("old response")))
    expect(container.querySelector("[data-request-status]")?.getAttribute("data-request-status")).toBe("idle")
    expect(button("notificationCenter.deny").disabled).toBe(false)
    source.respond.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject
      }),
    )
    act(() => button("supervision.request.allowOnce").click())
    act(() => root.render(null))
    await act(async () => fail(new Error("after unmount")))
    expect(container.textContent).toBe("")
  })
})
