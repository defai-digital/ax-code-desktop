import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { EditorView } from "@codemirror/view"

import { CodeMirrorEditor } from "./CodeMirrorEditor"

type EditorProps = React.ComponentProps<typeof CodeMirrorEditor>

const stableLineNumbersConfig: EditorProps["lineNumbersConfig"] = {}
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")

// Reconfiguring a compartment rebuilds the gutters, re-measures the editor and re-parses the
// document, and hosts hand over fresh objects on every render - so the editor must reconfigure
// only what actually changed.
describe("CodeMirrorEditor reconfiguration", () => {
  let container: HTMLDivElement
  let root: Root
  let view: EditorView | null

  const render = (props: Partial<EditorProps>) => {
    act(() =>
      root.render(
        <CodeMirrorEditor value={"const a = 1\nconst b = 2\n"} onChange={() => {}} onViewReady={(ready) => {
          view = ready
        }} {...props} />,
      ),
    )
  }

  // CodeMirror dispatches its own transactions; only the ones the editor builds carry effects.
  const reconfigureCalls = (dispatch: { mock: { calls: unknown[][] } }) =>
    dispatch.mock.calls
      .map((call) => (call[0] as { effects?: unknown[] } | undefined)?.effects)
      .filter((effects): effects is unknown[] => Array.isArray(effects))

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    view = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test("rebuilds only the line numbers for a fresh config object of equal value", () => {
    render({ lineNumbersConfig: {} })
    const dispatch = vi.spyOn(view as EditorView, "dispatch")

    render({ lineNumbersConfig: {} })

    const reconfigures = reconfigureCalls(dispatch)
    expect(reconfigures).toHaveLength(1)
    expect(reconfigures[0]).toHaveLength(1)
  })

  test("reconfigures one compartment for one changed input", () => {
    render({ lineNumbersConfig: stableLineNumbersConfig, readOnly: false })
    const dispatch = vi.spyOn(view as EditorView, "dispatch")

    render({ lineNumbersConfig: stableLineNumbersConfig, readOnly: true })

    const reconfigures = reconfigureCalls(dispatch)
    expect(reconfigures).toHaveLength(1)
    expect(reconfigures[0]).toHaveLength(1)
  })

  test("reconfigures nothing when no input changed", () => {
    render({ lineNumbersConfig: stableLineNumbersConfig, readOnly: false, enableSearch: true })
    const dispatch = vi.spyOn(view as EditorView, "dispatch")

    render({ lineNumbersConfig: stableLineNumbersConfig, readOnly: false, enableSearch: true })

    expect(reconfigureCalls(dispatch)).toHaveLength(0)
  })
})
