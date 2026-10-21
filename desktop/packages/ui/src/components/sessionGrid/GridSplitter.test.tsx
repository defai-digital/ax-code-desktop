import React from "react"
import { afterEach, expect, test } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { GridSplitter } from "./GridSplitter"

afterEach(cleanup)
function Harness({ axis = "columns" }: { axis?: "columns" | "rows" }) {
  const [ratio, setRatio] = React.useState(0.5)
  return <GridSplitter axis={axis} ratio={ratio} extent={1006} style={{}} label="Resize" onChange={setRatio} />
}
test("keyboard resizes a focusable separator, clamps both sides, and Home resets", () => {
  render(<Harness />)
  const splitter = screen.getByRole("separator")
  splitter.focus()
  expect(document.activeElement).toBe(splitter)
  expect(splitter.getAttribute("aria-orientation")).toBe("vertical")
  fireEvent.keyDown(splitter, { key: "ArrowLeft" })
  expect(splitter.getAttribute("aria-valuenow")).toBe("48")
  for (let i = 0; i < 60; i++) fireEvent.keyDown(splitter, { key: "ArrowLeft" })
  expect(splitter.getAttribute("aria-valuenow")).toBe("32")
  for (let i = 0; i < 60; i++) fireEvent.keyDown(splitter, { key: "ArrowRight" })
  expect(splitter.getAttribute("aria-valuenow")).toBe("68")
  fireEvent.keyDown(splitter, { key: "Home" })
  expect(splitter.getAttribute("aria-valuenow")).toBe("50")
})
test("horizontal separators use up/down and double click resets", async () => {
  const { act } = await import("react")
  render(<Harness axis="rows" />)
  const splitter = screen.getByRole("separator")
  expect(splitter.getAttribute("aria-orientation")).toBe("horizontal")
  fireEvent.keyDown(splitter, { key: "ArrowDown" })
  expect(splitter.getAttribute("aria-valuenow")).toBe("52")
  fireEvent.keyDown(splitter, { key: "ArrowRight" })
  expect(splitter.getAttribute("aria-valuenow")).toBe("52")
  act(() => splitter.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })))
  expect(splitter.getAttribute("aria-valuenow")).toBe("50")
})
