import React, { act } from "react"
import { render, cleanup } from "@/test/dom"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { TerminalViewport } from "./TerminalViewport"
import type { TerminalTheme } from "@/lib/terminalTheme"

const state = vi.hoisted(() => ({
  screen: "",
  resets: 0,
  bracketedPaste: false,
  init: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@ax-code/akitty-web", () => ({
  init: state.init,
  Terminal: class {
    cols = 80
    rows = 24
    options = { cursorBlink: false }
    textarea?: HTMLTextAreaElement
    open(container: HTMLElement) {
      this.textarea = document.createElement("textarea")
      container.appendChild(this.textarea)
      this.focus()
    }
    loadAddon() {}
    focus() {
      this.textarea?.focus()
    }
    dispose() {
      this.textarea?.remove()
    }
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
  state.init.mockReset().mockResolvedValue(undefined)
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

test("waits for the AkiTTY WASM asset before writing terminal output", async () => {
  const { promise, resolve } = Promise.withResolvers<void>()
  state.init.mockReturnValueOnce(promise)
  render(
    <TerminalViewport
      sessionKey="wasm-startup"
      chunks={[{ id: 1, data: "initial output" }]}
      onInput={vi.fn()}
      onResize={vi.fn()}
      theme={theme}
      fontFamily="monospace"
      fontSize={14}
      autoFocus={false}
    />,
  )
  expect(state.init).toHaveBeenCalledWith(expect.stringMatching(/\/akitty-vt\.wasm$/))
  expect(state.screen).toBe("")
  resolve()
  await waitFor(() => expect(state.screen).toBe("initial output"))
})

test("reports a WASM initialization failure and keeps the terminal closed", async () => {
  const error = new Error("WASM asset unavailable")
  state.init.mockRejectedValueOnce(error)
  const onInitializeError = vi.fn()
  render(
    <TerminalViewport
      sessionKey="wasm-failure"
      chunks={[{ id: 1, data: "initial output" }]}
      onInput={vi.fn()}
      onResize={vi.fn()}
      onInitializeError={onInitializeError}
      theme={theme}
      fontFamily="monospace"
      fontSize={14}
      autoFocus={false}
    />,
  )
  await waitFor(() => expect(onInitializeError).toHaveBeenCalledWith(error))
  expect(state.screen).toBe("")
})

test("keeps focus outside the terminal until autofocus is enabled", async () => {
  const props = {
    sessionKey: "focus",
    chunks: [{ id: 1, data: "ready" }],
    onInput: vi.fn(),
    onResize: vi.fn(),
    theme,
    fontFamily: "monospace",
    fontSize: 14,
  }
  const view = render(
    <>
      <button type="button">Continue editing</button>
      <TerminalViewport {...props} autoFocus={false} />
    </>,
  )
  const button = view.container.querySelector("button")
  expect(button).not.toBeNull()
  button?.focus()
  await waitFor(() => {
    expect(state.screen).toBe("ready")
    expect(document.activeElement).toBe(button)
  })

  view.rerender(
    <>
      <button type="button">Continue editing</button>
      <TerminalViewport {...props} autoFocus />
    </>,
  )
  expect(document.activeElement).toBe(view.container.querySelector("textarea"))
})

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

test("after a long buffer, appending one chunk writes only that chunk", async () => {
  const longChunks = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, data: `c${index + 1};` }))
  const baseProps = {
    onInput: vi.fn(),
    onResize: vi.fn(),
    theme,
    fontFamily: "monospace",
    fontSize: 14,
    autoFocus: false,
    sessionKey: "long-buffer",
  }
  const view = render(<TerminalViewport {...baseProps} chunks={longChunks} />)
  const expectedInitial = longChunks.map((chunk) => chunk.data).join("")
  await waitFor(() => expect(state.screen).toBe(expectedInitial))
  const resetsBefore = state.resets

  view.rerender(<TerminalViewport {...baseProps} chunks={[...longChunks, { id: 101, data: "NEW" }]} />)
  await waitFor(() => expect(state.screen).toBe(`${expectedInitial}NEW`))
  expect(state.resets).toBe(resetsBefore)
  cleanup()
})

test("a buffer trimmed past the cursor triggers the repaint path", async () => {
  const baseProps = {
    onInput: vi.fn(),
    onResize: vi.fn(),
    theme,
    fontFamily: "monospace",
    fontSize: 14,
    autoFocus: false,
    sessionKey: "trimmed-buffer",
  }
  const initial = [
    { id: 1, data: "one;" },
    { id: 2, data: "two;" },
    { id: 3, data: "three;" },
  ]
  const view = render(<TerminalViewport {...baseProps} chunks={initial} />)
  await waitFor(() => expect(state.screen).toBe("one;two;three;"))
  const resetsBefore = state.resets

  const trimmed = [
    { id: 10, data: "ten;" },
    { id: 11, data: "eleven;" },
  ]
  view.rerender(<TerminalViewport {...baseProps} chunks={trimmed} />)
  await waitFor(() => expect(state.resets).toBeGreaterThan(resetsBefore))
  await waitFor(() => expect(state.screen).toBe("ten;eleven;"))
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
