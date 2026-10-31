import React, { act } from "react"
import { render, cleanup } from "@/test/dom"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { TerminalViewport } from "./TerminalViewport"
import type { TerminalTheme } from "@/lib/terminalTheme"

const state = vi.hoisted(() => ({ screen: "", resets: 0, bracketedPaste: false }))
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
    hasBracketedPaste() {
      return state.bracketedPaste
    }
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
  state.bracketedPaste = false
})
afterEach(cleanup)
const waitFor = async (check: () => void) => {
  await act(async () => {})
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
  check()
}

/** A paste the way the DOM delivers one: clipboard text readable through clipboardData. */
const pasteEvent = (target: Element, text: string): Event => {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text" ? text : "") },
  })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
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

const viewportProps = (onInput: (data: string) => void, sessionKey: string) => ({
  chunks: [{ id: 1, data: "ready" }],
  onInput,
  onResize: vi.fn(),
  theme,
  fontFamily: "monospace",
  fontSize: 14,
  autoFocus: false,
  sessionKey,
})

test("sanitizes an embedded closing marker in a desktop bracketed paste", async () => {
  state.bracketedPaste = true
  const onInput = vi.fn()
  const view = render(<TerminalViewport {...viewportProps(onInput, "desktop-paste")} />)
  await waitFor(() => expect(state.screen).toBe("ready"))

  const container = view.container.firstElementChild as HTMLElement
  // Stands in for AkiTTY's own textarea, whose paste listener wraps the raw clipboard text in
  // ESC[200~ … ESC[201~ without stripping anything the payload already contains.
  const akittyTextarea = document.createElement("textarea")
  container.appendChild(akittyTextarea)
  const akittyPaste = vi.fn()
  akittyTextarea.addEventListener("paste", akittyPaste)

  const pasted = "\x1b[201~\nrm -rf x\n"
  const event = pasteEvent(akittyTextarea, pasted)

  expect(event.defaultPrevented).toBe(true)
  expect(akittyPaste).not.toHaveBeenCalled()
  expect(onInput).toHaveBeenCalledTimes(1)
  expect(onInput).toHaveBeenCalledWith("\x1b[200~\nrm -rf x\n\x1b[201~")
  cleanup()
})

test("sends an ordinary desktop paste as written when bracketed paste is off", async () => {
  const onInput = vi.fn()
  const view = render(<TerminalViewport {...viewportProps(onInput, "desktop-plain-paste")} />)
  await waitFor(() => expect(state.screen).toBe("ready"))

  const container = view.container.firstElementChild as HTMLElement
  pasteEvent(container, "echo hi\n")

  expect(onInput).toHaveBeenCalledTimes(1)
  expect(onInput).toHaveBeenCalledWith("echo hi\n")
  cleanup()
})

test("keeps the hidden-input paste path sanitizing on its own", async () => {
  state.bracketedPaste = true
  const onInput = vi.fn()
  render(<TerminalViewport {...viewportProps(onInput, "touch-paste")} enableTouchScroll />)
  await waitFor(() => expect(state.screen).toBe("ready"))

  const hiddenInput = document.querySelector<HTMLTextAreaElement>("textarea[data-terminal-hidden-input]")
  expect(hiddenInput).not.toBeNull()
  const event = pasteEvent(hiddenInput as HTMLTextAreaElement, "\x1b[201~\nrm -rf x\n")

  expect(event.defaultPrevented).toBe(true)
  expect(onInput).toHaveBeenCalledTimes(1)
  expect(onInput).toHaveBeenCalledWith("\x1b[200~\nrm -rf x\n\x1b[201~")
  cleanup()
})
