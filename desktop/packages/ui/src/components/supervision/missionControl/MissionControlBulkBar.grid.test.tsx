import React from "react"
import { afterEach, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { MissionControlBulkBar } from "./MissionControlBulkBar"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)
test.each([0, 1, 2, 3, 4, 5])("Open as grid only enables 2–4 selected rows: %i", (count) => {
  const open = vi.fn()
  render(
    <MissionControlBulkBar
      count={count}
      runningCount={0}
      busy={false}
      workingSets={[]}
      onAddToWorkingSet={vi.fn()}
      onCreateWorkingSet={vi.fn()}
      onStop={vi.fn()}
      onArchive={vi.fn()}
      onClear={vi.fn()}
      onOpenGrid={open}
    />,
  )
  const button = screen.getByRole("button", { name: "sessionGrid.openSelected" }) as HTMLButtonElement
  expect(button.disabled).toBe(count < 2 || count > 4)
  fireEvent.click(button)
  expect(open).toHaveBeenCalledTimes(count >= 2 && count <= 4 ? 1 : 0)
})
test("busy bulk operations disable grid entry", () => {
  render(
    <MissionControlBulkBar
      count={2}
      runningCount={0}
      busy
      workingSets={[]}
      onAddToWorkingSet={vi.fn()}
      onCreateWorkingSet={vi.fn()}
      onStop={vi.fn()}
      onArchive={vi.fn()}
      onClear={vi.fn()}
      onOpenGrid={vi.fn()}
    />,
  )
  expect((screen.getByRole("button", { name: "sessionGrid.openSelected" }) as HTMLButtonElement).disabled).toBe(true)
})
