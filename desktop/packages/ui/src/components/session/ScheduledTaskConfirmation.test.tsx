import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { ScheduledTaskConfirmation } from "./ScheduledTaskConfirmation"
import type { ScheduledTaskDraft } from "./ScheduledTaskEditorDialog"

let container: HTMLDivElement
let root: Root
const schedule: ScheduledTaskDraft["schedule"] = {
  kind: "daily",
  times: ["17:00", "09:00", "09:00"],
  timezone: "America/New_York",
  weekdays: [5, 1],
  onceDate: "2027-03-14",
  onceTime: "03:30",
}
const render = (overrides: Partial<React.ComponentProps<typeof ScheduledTaskConfirmation>> = {}) =>
  act(() =>
    root.render(
      <I18nProvider>
        <ScheduledTaskConfirmation schedule={schedule} enabled catchUpPolicy="run_once" {...overrides} />
      </I18nProvider>,
    ),
  )
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

test("confirms normalized daily/weekly wall times and timezone without predicting the next run", () => {
  render()
  expect(container.textContent).toContain("Daily 09:00, 17:00 (America/New_York)")
  expect(container.textContent).toContain("one catch-up run")
  expect(container.textContent).toContain("Tasks run on this computer")
  render({ schedule: { ...schedule, kind: "weekly" } })
  expect(container.textContent).toContain("Mon, Fri 09:00, 17:00 (America/New_York)")
})
test("one-time confirmation retains the chosen wall date, time and zone", () => {
  render({ schedule: { ...schedule, kind: "once" } })
  expect(container.textContent).toContain("One-time 2027-03-14 03:30 · America/New_York")
})
test("disabled drafts and skip policy explicitly disclose their behavior", () => {
  render({ enabled: false, catchUpPolicy: "skip" })
  expect(container.textContent).toContain("Automatic runs are off")
  expect(container.textContent).toContain("Missed runs are skipped")
  expect(container.textContent).not.toContain("catch-up")
})
test("preserves a canonical irregular schedule description until the schedule is edited", () => {
  render({ originalDescription: "Cron 30 9 1 * * (UTC)" })
  expect(container.textContent).toContain("Cron 30 9 1 * * (UTC)")
  expect(container.textContent).not.toContain("Daily")
  render()
  expect(container.textContent).toContain("Daily")
})
test("incomplete recurrence gives guidance instead of presenting a valid schedule", () => {
  render({ schedule: { ...schedule, kind: "weekly", weekdays: [] } })
  expect(container.textContent).toContain("Select at least one weekday")
  render({ schedule: { ...schedule, times: ["invalid"] } })
  expect(container.textContent).toContain("Add at least one valid time")
})
