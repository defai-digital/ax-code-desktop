import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { SupervisionRow } from "@/lib/supervision/rows"
import type { SupervisionState } from "@/lib/supervision/sessionState"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import { MissionControlRow } from "./MissionControlRow"

const row: SupervisionRow = {
  sessionId: "s1",
  title: "Fix a long task",
  state: "review",
  treeSessionIds: ["s1"],
  projectId: "p1",
  projectLabel: "Long project name",
  directory: "/repo",
  updatedAt: Date.now(),
  evidence: { files: 3, additions: 20, deletions: 1 },
}
describe("Mission Control row interaction", () => {
  let container: HTMLDivElement
  let root: Root
  const onSelect = vi.fn(),
    onOpen = vi.fn(),
    onPrimary = vi.fn(),
    onRemove = vi.fn()
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const render = (state: SupervisionState = "review") =>
    act(() =>
      root.render(
        <div role="grid" tabIndex={0}>
          <MissionControlRow
            row={{ ...row, state }}
            selected
            expanded={false}
            activeWorkingSetId="w1"
            primaryLabel="Review changes"
            onSelect={onSelect}
            onOpen={onOpen}
            onPrimary={onPrimary}
            onCompare={vi.fn()}
            onRemoveFromSet={onRemove}
          />
        </div>,
      ),
    )
  test("primary and remove actions do not select the row; row selection returns focus to the grid", () => {
    render()
    const buttons = container.querySelectorAll("button")
    act(() => buttons[0].click())
    expect(onPrimary).toHaveBeenCalledWith(row)
    expect(onSelect).not.toHaveBeenCalled()
    act(() => buttons[1].click())
    expect(onRemove).toHaveBeenCalledWith("w1", "s1")
    expect(onSelect).not.toHaveBeenCalled()
    act(() => container.querySelector<HTMLElement>('[role="row"]')!.click())
    expect(onSelect).toHaveBeenCalledWith("s1")
    expect(document.activeElement).toBe(container.querySelector('[role="grid"]'))
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(6)
    expect(container.textContent).toContain(row.projectLabel)
  })
  test.each(["permission", "question", "error", "review", "running", "idle"] as const)(
    "%s keeps a textual status and stable row identity",
    (state) => {
      render(state)
      expect(container.querySelector('[role="row"]')?.id).toBe("mission-row-s1")
      expect(container.querySelector("[data-supervision-state]")?.textContent).toContain(`supervision.state.${state}`)
    },
  )
})
