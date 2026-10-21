import React from "react"
import { afterEach, expect, test, vi } from "vitest"
import { cleanup, render, screen } from "@/test/dom"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { MissionControlRow } from "./MissionControlRow"
import { MissionControlPeek } from "./MissionControlPeek"

vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/i18n/messages/en")
  return {
    useI18n: () => ({
      t: (key: keyof typeof dict, params: Record<string, string | number> = {}) =>
        (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? name)),
      number: String,
    }),
  }
})
const row: SupervisionRow = {
  sessionId: "a",
  title: "Task",
  state: "running",
  updatedAt: 0,
  treeSessionIds: ["a"],
  projectId: null,
  projectLabel: null,
  directory: "/repo",
  evidence: null,
  goal: null,
}
const noop = () => undefined
function View({ item }: { item: SupervisionRow }) {
  return (
    <MissionControlRow
      row={item}
      selected={false}
      bulkSelected={false}
      onToggleSelection={noop}
      expanded
      activeWorkingSetId={null}
      primaryLabel="Open"
      onToggleDetails={noop}
      onSelect={noop}
      onOpen={noop}
      onPrimary={noop}
      onRemoveFromSet={noop}
    >
      <MissionControlPeek
        row={item}
        requests={[]}
        workingSets={[]}
        isCreatingSetForRow={false}
        newSetName=""
        onNewSetNameChange={noop}
        onOpen={noop}
        onAddToWorkingSet={noop}
        onStartCreateSet={noop}
        onSubmitCreateSet={noop}
        onCancelCreateSet={noop}
      />
    </MissionControlRow>
  )
}
afterEach(cleanup)
test.each(["open", "draft", "merged", "closed"] as const)(
  "row and Peek expose accessible %s PR chip with explicit CI",
  (state) => {
    const { container } = render(<View item={{ ...row, pullRequest: { number: 42, state, checks: "failed" } }} />)
    const name = `Pull request #42, ${state[0].toUpperCase()}${state.slice(1)} · CI checks failed`
    expect(screen.getAllByRole("img", { name })).toHaveLength(2)
    expect(container.querySelector(".mission-control-peek [data-mission-pr]")).toBeTruthy()
    expect(container.querySelector("[data-mission-pr]")?.className).toContain("text-[var(--status-error)]")
  },
)
test("unknown PR/checks stay hidden and stale status is explicitly named without a success color", () => {
  const { container, rerender } = render(<View item={row} />)
  expect(container.querySelector("[data-mission-pr]")).toBeNull()
  rerender(<View item={{ ...row, pullRequest: { number: 42, state: "open" } }} />)
  expect(screen.getAllByRole("img", { name: "Pull request #42, Open" })).toHaveLength(2)
  expect(container.textContent).not.toContain("CI checks")
  rerender(<View item={{ ...row, pullRequest: { number: 42, state: "open", checks: "passed", stale: true } }} />)
  expect(
    screen.getAllByRole("img", { name: "Pull request #42, Open · CI checks passed · PR status may be outdated" }),
  ).toHaveLength(2)
  expect(container.querySelector("[data-mission-pr]")?.className).not.toContain("text-[var(--status-success)]")
})
