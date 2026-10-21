import { runInNewContext } from "node:vm"
import { afterEach, expect, test, vi } from "vitest"
import { focusPaletteForEscape, waitForGridReturn } from "./supervision-handoffs.mjs"

afterEach(() => vi.useRealTimers())

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

test("return waits for native closure before activating main, then for both chat and page presence", async () => {
  vi.useFakeTimers()
  let targets = [{ id: "mini-1", url: "about:blank" }, { id: "unrelated-mini", url: "https://app.test/mini-chat.html?sessionId=ses_a_other" }]
  let focused = false
  const frames = []
  const pages = []
  const document = {
    hasFocus: () => focused,
    querySelectorAll: (selector) => (selector.endsWith("iframe") ? frames : pages),
  }
  const session = {
    send: vi.fn(async () => {
      focused = true
    }),
    evaluate: vi.fn((expression) => runInNewContext(expression, { document, URL })),
  }
  let completed = false
  const returned = waitForGridReturn(
    session,
    9222,
    { id: "mini-1", sessionId: "ses_a", hasPage: true },
    async () => targets,
  ).then(() => {
    completed = true
  })
  await vi.advanceTimersByTimeAsync(500)
  expect(session.send).not.toHaveBeenCalled()
  expect(completed).toBe(false)
  targets = targets.slice(1)
  await vi.advanceTimersByTimeAsync(500)
  expect(session.send).toHaveBeenCalledExactlyOnceWith("Page.bringToFront")
  expect(completed).toBe(false)
  frames.push({ src: "https://app.test/?sessionId=ses_a" })
  await vi.advanceTimersByTimeAsync(500)
  expect(completed).toBe(false)
  pages.push({ getAttribute: () => "ses_other" })
  await vi.advanceTimersByTimeAsync(500)
  expect(completed).toBe(false)
  pages.push({ getAttribute: () => "ses_a" })
  await vi.advanceTimersByTimeAsync(500)
  await returned
  expect(completed).toBe(true)
})

test("a session without a project browser returns without inventing page presence", async () => {
  const document = {
    hasFocus: () => true,
    querySelectorAll: (selector) => (selector.endsWith("iframe") ? [{ src: "https://app.test/?sessionId=ses_a" }] : []),
  }
  const session = {
    send: vi.fn(async () => {}),
    evaluate: (expression) => runInNewContext(expression, { document, URL }),
  }
  await waitForGridReturn(session, 9222, { id: "mini-1", sessionId: "ses_a", hasPage: false }, async () => [])
  expect(session.send).toHaveBeenCalledWith("Page.bringToFront")
})
