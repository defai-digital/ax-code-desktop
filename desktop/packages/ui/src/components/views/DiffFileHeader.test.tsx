import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))
vi.mock("@/components/icons/FileTypeIcon", () => ({ FileTypeIcon: () => null }))

import { DiffFileHeader, type DiffFileHeaderProps } from "./DiffFileHeader"

let root: Root
let container: HTMLDivElement
const onToggle = vi.fn()
const onOpenInEditor = vi.fn()
const onLayoutChange = vi.fn()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (overrides: Partial<DiffFileHeaderProps> = {}) =>
  act(() =>
    root.render(
      <DiffFileHeader
        path="src/lib/file.ts"
        descriptor={{ code: "M", color: "var(--status-warning)", descriptionKey: "diffView.change.modified" }}
        totals={<span>+3 -1</span>}
        isExpanded
        isSelected={false}
        onToggle={onToggle}
        onOpenInEditor={onOpenInEditor}
        layoutMode="unified"
        onLayoutChange={onLayoutChange}
        {...overrides}
      />,
    ),
  )
const toggle = () => container.querySelector<HTMLButtonElement>("[data-diff-file-toggle]")!
const open = () => container.querySelector<HTMLButtonElement>("[data-diff-file-open]")
const layout = () =>
  container.querySelector<HTMLButtonElement>("[aria-label='diffView.actions.switchToSideBySide']")

test("no button holds another button (G UX-12)", () => {
  render()
  const buttons = Array.from(container.querySelectorAll("button"))
  expect(buttons).toHaveLength(3)
  for (const button of buttons) expect(button.querySelector("button")).toBeNull()
})

test("one button expands and collapses the file and says which it is", () => {
  render()
  expect(toggle().getAttribute("aria-expanded")).toBe("true")
  expect(toggle().textContent).toContain("+3 -1")
  act(() => toggle().click())
  expect(onToggle).toHaveBeenCalledOnce()
  render({ isExpanded: false })
  expect(toggle().getAttribute("aria-expanded")).toBe("false")
})

test("the editor and layout buttons are named and do not also toggle the file", () => {
  render()
  expect(open()?.getAttribute("aria-label")).toBe("diffView.actions.openFileInEditorAtChange")
  act(() => open()!.click())
  expect(onOpenInEditor).toHaveBeenCalledOnce()
  act(() => layout()!.click())
  expect(onLayoutChange).toHaveBeenCalledWith("side-by-side")
  expect(onToggle).not.toHaveBeenCalled()
  render({ layoutMode: "side-by-side" })
  expect(container.querySelector("[aria-label='diffView.actions.switchToUnified']")).not.toBeNull()
})

test("a file that cannot be opened has no editor button", () => {
  render({ onOpenInEditor: undefined })
  expect(open()).toBeNull()
})
