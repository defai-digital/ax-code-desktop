import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { ScheduledTaskRun } from "@/lib/scheduledTasksApi"

const { fetchScheduledTaskRuns } = vi.hoisted(() => ({ fetchScheduledTaskRuns: vi.fn() }))

vi.mock("@/lib/scheduledTasksApi", () => ({ fetchScheduledTaskRuns }))

const { ScheduledTaskRunHistoryDialog } = await import("./ScheduledTaskRunHistoryDialog")

const run = (overrides: Partial<ScheduledTaskRun> & Pick<ScheduledTaskRun, "id">): ScheduledTaskRun => ({
  taskID: "t1",
  triggerType: "scheduled",
  status: "completed",
  coalescedCount: 0,
  time: { created: 1_000 },
  ...overrides,
})

const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe("ScheduledTaskRunHistoryDialog", () => {
  let container: HTMLDivElement
  let root: Root

  const target = { directory: "/work/alpha", title: "Nightly", projectLabel: "Alpha", taskIDs: ["t1", "t2"] }

  const render = async (props: { target: typeof target | null }) => {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(ScheduledTaskRunHistoryDialog, { target: props.target, onOpenChange: () => {} }),
        ),
      )
    })
    await flush()
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchScheduledTaskRuns.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("loads every family member and lists the merged runs newest first", async () => {
    fetchScheduledTaskRuns.mockResolvedValue([
      run({ id: "old", taskID: "t1", timeStarted: 1_000, timeCompleted: 46_000 }),
      run({ id: "new", taskID: "t2", status: "failed", error: "boom", timeStarted: 9_000, triggerType: "manual" }),
      run({ id: "mid", taskID: "t1", status: "timeout", timeStarted: 5_000 }),
    ])
    await render({ target })

    expect(fetchScheduledTaskRuns).toHaveBeenCalledWith("/work/alpha", ["t1", "t2"], 20)
    const text = document.body.textContent ?? ""
    expect(text).toContain("Run history: Nightly")
    expect(text).toContain("1 of 3 finished runs succeeded")
    expect(text).toContain("2 failures in a row")
    expect(text).toContain("boom")
    expect(text).toContain("Started manually")
    expect(text).toContain("45s")
    const outcomes = Array.from(document.body.querySelectorAll("li .typography-ui-label > span:first-child")).map(
      (node) => node.textContent,
    )
    expect(outcomes).toEqual(["Failed", "Timed out", "Succeeded"])
  })

  test("shows an empty state for a task that never ran", async () => {
    fetchScheduledTaskRuns.mockResolvedValue([])
    await render({ target })
    expect(document.body.textContent).toContain("This task hasn't run yet.")
  })

  test("reports a load failure and retries", async () => {
    fetchScheduledTaskRuns.mockRejectedValueOnce(new Error("runtime down")).mockResolvedValueOnce([run({ id: "a" })])
    await render({ target })
    expect(document.body.querySelector("[role=alert]")?.textContent).toContain("runtime down")

    const retry = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent === "Retry")
    expect(retry).toBeTruthy()
    await act(async () => {
      retry?.click()
    })
    await flush()
    expect(fetchScheduledTaskRuns).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain("1 of 1 finished runs succeeded")
  })

  test("paints a new target as loading, never with the previous task's runs", async () => {
    fetchScheduledTaskRuns.mockResolvedValueOnce([run({ id: "a", status: "failed", error: "alpha boom" })])
    await render({ target })
    expect(document.body.textContent).toContain("alpha boom")

    // Another row's history is opened while the dialog is up. The effect that
    // resets the state runs after the first commit, so the DOM at the moment
    // it fetches is what the user saw for that frame.
    let firstPaint = ""
    fetchScheduledTaskRuns.mockImplementationOnce(() => {
      firstPaint = document.body.textContent ?? ""
      return new Promise<never>(() => {})
    })
    await render({ target: { ...target, title: "Weekly", taskIDs: ["t3"] } })
    expect(firstPaint).toContain("Run history: Weekly")
    expect(firstPaint).not.toContain("alpha boom")
    expect(document.body.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("alpha boom")
  })

  test("fetches nothing while closed", async () => {
    await render({ target: null })
    expect(fetchScheduledTaskRuns).not.toHaveBeenCalled()
  })
})
