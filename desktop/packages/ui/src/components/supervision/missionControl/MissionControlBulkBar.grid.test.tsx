import React from "react"
import { afterEach, expect, test, vi } from "vitest"
import { cleanup, render, screen } from "@/test/dom"
import { MissionControlBulkBar } from "./MissionControlBulkBar"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

test("MissionControlBulkBar no longer exposes the retired SessionGrid entry", () => {
  render(
    <MissionControlBulkBar
      count={2}
      runningCount={0}
      busy={false}
      workingSets={[]}
      onAddToWorkingSet={vi.fn()}
      onCreateWorkingSet={vi.fn()}
      onStop={vi.fn()}
      onArchive={vi.fn()}
      onClear={vi.fn()}
    />,
  )
  expect(screen.queryByRole("button", { name: "sessionGrid.openSelected" })).toBeNull()
})
