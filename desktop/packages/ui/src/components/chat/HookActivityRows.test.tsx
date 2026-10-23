import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { HookCompleted } from "@defai-digital/ax-code-sdk/v2/client"
import { useHookActivityStore, type HookRun } from "@/stores/useHookActivityStore"

vi.doMock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
    relativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
      new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit),
  }),
}))

const { HookActivityRows } = await import("./HookActivityRows")
const { visibleHookRows } = await import("./hookActivity")

const completed = (overrides: Partial<HookCompleted> = {}): HookCompleted => ({
  sessionID: "ses_1",
  event: "PreToolUse",
  tool: "bash",
  command: "guard.sh",
  source: "project",
  exit: 0,
  durationMs: 5,
  outcome: "blocked",
  ...overrides,
})

const run = (id: string, overrides: Partial<HookRun> = {}): HookRun => ({
  ...completed(),
  receivedAt: 0,
  ...overrides,
  id,
})

const seed = (properties: HookCompleted, receivedAt: number) => {
  useHookActivityStore.getState().ingestHookCompleted(properties, "/repo", receivedAt)
}

describe("visibleHookRows", () => {
  test("keeps only blocked and ask runs, newest first", () => {
    const runs = [
      run("a", { outcome: "ok" }),
      run("b", { outcome: "blocked" }),
      run("c", { outcome: "failed" }),
      run("d", { outcome: "ask" }),
      run("e", { outcome: "rewritten" }),
    ]
    const { visible, hiddenCount } = visibleHookRows(runs, new Set())
    expect(visible.map((entry) => entry.id)).toEqual(["d", "b"])
    expect(hiddenCount).toBe(0)
  })

  test("caps visible rows and reports the hidden remainder", () => {
    const runs = ["a", "b", "c", "d", "e"].map((id) => run(id))
    const { visible, hiddenCount } = visibleHookRows(runs, new Set())
    expect(visible.map((entry) => entry.id)).toEqual(["e", "d", "c"])
    expect(hiddenCount).toBe(2)
  })

  test("excludes dismissed runs before capping", () => {
    const runs = ["a", "b", "c", "d"].map((id) => run(id))
    const { visible, hiddenCount } = visibleHookRows(runs, new Set(["d"]))
    expect(visible.map((entry) => entry.id)).toEqual(["c", "b", "a"])
    expect(hiddenCount).toBe(0)
  })
})

describe("HookActivityRows", () => {
  const NOW = 1_000_000
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() => root.render(<HookActivityRows sessionId="ses_1" />))
  }

  const rows = () => Array.from(container.querySelectorAll<HTMLElement>("[data-hook-row]"))

  beforeEach(() => {
    useHookActivityStore.setState({ runsBySession: {}, countersByDirectory: {} })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("shows blocked and ask runs and hides ok and failed runs", () => {
    seed(completed({ outcome: "ok", tool: "read" }), 1000)
    seed(completed({ outcome: "failed", tool: "edit" }), 2000)
    seed(completed({ outcome: "blocked", tool: "bash" }), 3000)
    seed(completed({ outcome: "ask", tool: "write" }), 4000)
    render()

    expect(rows()).toHaveLength(2)
    expect(rows().map((row) => row.dataset.hookOutcome)).toEqual(["ask", "blocked"])
    expect(container.textContent).toContain("chat.hookActivity.blocked:bash")
    expect(container.textContent).toContain("chat.hookActivity.asked:write")
    expect(container.textContent).not.toContain("read")
    expect(container.textContent).not.toContain("edit")
  })

  test("renders the event, source, reason (full on hover) and relative time", () => {
    seed(
      completed({ source: "pack", pack: "safety-pack", reason: "Destructive command refused by policy" }),
      Date.now() - 60_000,
    )
    render()

    const [row] = rows()
    expect(row.textContent).toContain("PreToolUse")
    expect(row.textContent).toContain("chat.hookActivity.sourcePack:safety-pack")
    const reason = Array.from(row.querySelectorAll("span")).find((span) =>
      span.textContent?.includes("Destructive command"),
    )
    expect(reason?.getAttribute("title")).toBe("Destructive command refused by policy")
    expect(row.textContent).toContain("1 minute ago")
  })

  test("updates the relative age while the rows stay mounted", () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW - 1_000)
    try {
      seed(completed(), NOW)
      render()
      expect(rows()[0]?.textContent).toContain("now")

      act(() => {
        vi.advanceTimersByTime(30_000)
      })

      expect(rows()[0]?.textContent).toContain("29 seconds ago")
    } finally {
      vi.useRealTimers()
    }
  })

  test("falls back to the generic title when the run has no tool", () => {
    seed(completed({ tool: undefined, event: "Stop" }), 1000)
    render()
    expect(container.textContent).toContain("chat.hookActivity.blockedGeneric")
  })

  test("shows at most three rows with a +N more line", () => {
    for (let index = 0; index < 5; index++) {
      seed(completed({ tool: `tool-${index}` }), 1000 + index)
    }
    render()

    expect(rows()).toHaveLength(3)
    expect(container.textContent).toContain("chat.hookActivity.more:2")
  })

  test("dismissing a row removes only that row", () => {
    seed(completed({ tool: "bash" }), 1000)
    seed(completed({ outcome: "ask", tool: "write" }), 2000)
    render()
    expect(rows()).toHaveLength(2)

    const dismissButton = rows()[0].querySelector<HTMLButtonElement>('button[aria-label="chat.hookActivity.dismiss"]')!
    act(() => dismissButton.click())

    expect(rows()).toHaveLength(1)
    expect(container.textContent).toContain("chat.hookActivity.blocked:bash")
    expect(container.textContent).not.toContain("chat.hookActivity.asked:write")
  })

  test("renders nothing when the session has no notable runs", () => {
    seed(completed({ outcome: "ok" }), 1000)
    render()
    expect(rows()).toHaveLength(0)
    expect(container.textContent).toBe("")
  })
})
