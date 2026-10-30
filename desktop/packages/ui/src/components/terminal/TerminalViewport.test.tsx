import React, { act } from "react"
import { render, cleanup } from "@/test/dom"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { TerminalViewport } from "./TerminalViewport"
import type { TerminalTheme } from "@/lib/terminalTheme"

const state = vi.hoisted(() => ({ screen: "", resets: 0 }))
vi.mock("./ghosttyLoader", () => ({ getGhostty: async () => ({}) }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@ax-code/akitty-web", () => ({
  Terminal: class {
    cols = 80
    rows = 24
    open() {}
    loadAddon() {}
    focus() {}
    dispose() {}
    setOption() {}
    hasSelection() {
      return false
    }
    onData() {
      return { dispose() {} }
    }
    onScroll() {
      return { dispose() {} }
    }
    onSelectionChange() {
      return { dispose() {} }
    }
    reset() {
      state.screen = ""
      state.resets++
    }
    write(data: string, done: () => void) {
      state.screen += data
      done()
    }
  },
  FitAddon: class {
    fit() {}
  },
}))

const theme = Object.fromEntries(
  [
    "background",
    "foreground",
    "cursor",
    "cursorAccent",
    "selectionBackground",
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "brightBlack",
    "brightRed",
    "brightGreen",
    "brightYellow",
    "brightBlue",
    "brightMagenta",
    "brightCyan",
    "brightWhite",
  ].map((key) => [key, "#000000"]),
) as unknown as TerminalTheme

beforeEach(() => {
  state.screen = ""
  state.resets = 0
})
afterEach(cleanup)
const waitFor = async (check: () => void) => {
  await act(async () => {})
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
  check()
}

test("replays retained output when the session changes with the same chunk snapshot", async () => {
  const props = {
    chunks: [{ id: 1, data: "retained output" }],
    onInput: vi.fn(),
    onResize: vi.fn(),
    theme,
    fontFamily: "monospace",
    fontSize: 14,
    autoFocus: false,
  }
  const view = render(<TerminalViewport {...props} sessionKey="first" />)
  await waitFor(() => expect(state.screen).toBe("retained output"))
  const resets = state.resets
  view.rerender(<TerminalViewport {...props} sessionKey="second" />)
  await waitFor(() => expect(state.resets).toBeGreaterThan(resets))
  await waitFor(() => expect(state.screen).toBe("retained output"))
  cleanup()
})

test("does not duplicate output when the session and chunks are unchanged", async () => {
  const props = {
    chunks: [{ id: 1, data: "once" }],
    onInput: vi.fn(),
    onResize: vi.fn(),
    theme,
    fontFamily: "monospace",
    fontSize: 14,
    autoFocus: false,
    sessionKey: "same",
  }
  const view = render(<TerminalViewport {...props} />)
  await waitFor(() => expect(state.screen).toBe("once"))
  view.rerender(<TerminalViewport {...props} className="resized" />)
  expect(state.screen).toBe("once")
  cleanup()
})
