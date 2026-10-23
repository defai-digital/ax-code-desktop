import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const loads = vi.hoisted(() => ({ count: 0, failuresLeft: 0 }))

vi.mock("@/lib/chunkLoadRecovery", () => ({
  importWithChunkRecovery: (load: () => Promise<unknown>) => {
    loads.count += 1
    if (loads.failuresLeft > 0) {
      loads.failuresLeft -= 1
      return Promise.reject(new Error("chunk unavailable"))
    }
    return load()
  },
}))

vi.mock("./composerCodeHighlight", () => ({
  highlightFencedCode: () => [],
}))

import { useFencedCodeHighlighter } from "./useFencedCodeHighlighter"

const Probe = ({ message, inputMode }: { message: string; inputMode: string }) => {
  useFencedCodeHighlighter(message, inputMode)
  return <div data-probe="" />
}

describe("fenced code highlighter loader", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    loads.count = 0
    loads.failuresLeft = 0
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const show = (message: string, inputMode = "normal") =>
    act(async () => {
      root.render(<Probe message={message} inputMode={inputMode} />)
      await Promise.resolve()
    })

  test("loads the highlighter when a fence appears and not on later keystrokes", async () => {
    await show("hello")
    await show("hello!")
    expect(loads.count).toBe(0)

    await show("hello!\n```")
    expect(loads.count).toBe(1)

    await show("hello!\n```\nconst value = 1")
    await show("hello!\n```\nconst value = 12")
    expect(loads.count).toBe(1)
  })

  test("does not load the highlighter for a shell draft that contains a fence", async () => {
    await show("```\nls\n```", "shell")
    expect(loads.count).toBe(0)
  })
  test("a failed load is retried on the next keystroke and stops retrying once it succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    loads.failuresLeft = 1

    await show("```\na")
    expect(loads.count).toBe(1)

    await show("```\nab")
    expect(loads.count).toBe(2)

    await show("```\nabc")
    await show("```\nabcd")
    expect(loads.count).toBe(2)
    warn.mockRestore()
  })
})
