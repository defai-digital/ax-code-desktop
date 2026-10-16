import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.doMock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }),
}))

const { InlineCommentInput } = await import("./InlineCommentInput")
const { I18nProvider } = await import("@/lib/i18n")

describe("InlineCommentInput composition", () => {
  let container: HTMLDivElement
  let root: Root
  const onCancel = vi.fn()
  const onSave = vi.fn()

  beforeEach(() => {
    onCancel.mockReset()
    onSave.mockReset()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  const render = () =>
    act(() =>
      root.render(
        <I18nProvider>
          <InlineCommentInput initialText="半" onSave={onSave} onCancel={onCancel} />
        </I18nProvider>,
      ),
    )

  const pressEscape = (isComposing: boolean) =>
    act(() => {
      const textarea = container.querySelector("textarea")
      if (!textarea) throw new Error("textarea not rendered")
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, isComposing }))
    })

  test("keeps the comment when Escape dismisses an input method's candidates", () => {
    // Escape is how a composition is abandoned, and the handler cancelled the whole inline comment on it: the text
    // already typed was lost, and the field unmounted under the user. The composer and the question card gate the
    // same way, through `lib/ime`.
    render()

    pressEscape(true)
    expect(onCancel).not.toHaveBeenCalled()

    // Escape still cancels once the composition is over.
    pressEscape(false)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
