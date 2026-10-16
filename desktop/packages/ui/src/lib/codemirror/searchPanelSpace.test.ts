import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { EditorView } from "@codemirror/view"
import { closeSearchPanel, openSearchPanel, search } from "@codemirror/search"

import { searchPanelSpace, searchPanelSpaceField, setSearchPanelSpace } from "./searchPanelSpace"

// jsdom does no layout, so the tests hand in the panel height the plugin would measure.
const views: EditorView[] = []

const editor = () => {
  const view = new EditorView({
    doc: "a\nb\nc",
    extensions: [search({ top: true }), searchPanelSpace()],
    parent: document.body,
  })
  views.push(view)
  return view
}

describe("searchPanelSpace", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    for (const view of views.splice(0)) {
      view.destroy()
    }
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  test("pads the content by the measured panel height while search is open", () => {
    const view = editor()
    openSearchPanel(view)
    view.dispatch({ effects: setSearchPanelSpace.of(42) })

    expect(view.state.field(searchPanelSpaceField)).toBe(42)
    expect(view.contentDOM.style.paddingTop).toBe("42px")
  })

  test("follows the panel when it grows", () => {
    const view = editor()
    openSearchPanel(view)
    view.dispatch({ effects: setSearchPanelSpace.of(42) })
    view.dispatch({ effects: setSearchPanelSpace.of(78) })

    expect(view.contentDOM.style.paddingTop).toBe("78px")
  })

  test("removes the space when search closes", () => {
    const view = editor()
    openSearchPanel(view)
    view.dispatch({ effects: setSearchPanelSpace.of(42) })
    closeSearchPanel(view)

    expect(view.state.field(searchPanelSpaceField)).toBe(0)
    expect(view.contentDOM.style.paddingTop).toBe("")
  })

  test("ignores measurements while search is closed", () => {
    const view = editor()
    view.dispatch({ effects: setSearchPanelSpace.of(42) })

    expect(view.state.field(searchPanelSpaceField)).toBe(0)
    expect(view.contentDOM.style.paddingTop).toBe("")
  })
})
