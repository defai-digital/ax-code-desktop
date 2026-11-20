import { runInNewContext } from "node:vm"
import { expect, test, vi } from "vitest"
import { focusPaletteForEscape } from "./supervision-handoffs.mjs"

test("Escape preparation activates the native window and moves focus out of the scope select", async () => {
  let nativeFocus = false
  const document = { activeElement: { tagName: "SELECT" }, hasFocus: () => nativeFocus }
  const input = {
    focus: () => {
      document.activeElement = input
    },
  }
  document.querySelector = () => input
  const session = {
    send: vi.fn(async () => {
      nativeFocus = true
    }),
    evaluate: (expression) => runInNewContext(expression, { document }),
  }
  await focusPaletteForEscape(session)
  expect(session.send).toHaveBeenCalledWith("Page.bringToFront")
  expect(document.hasFocus()).toBe(true)
  expect(document.activeElement).toBe(input)
})
