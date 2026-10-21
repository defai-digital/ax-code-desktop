import React from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"

vi.mock("@/hooks/useSplitPane", () => ({
  useSplitPane: () => ({ splitEnabled: true, splitRatio: 0.5, splitRightTab: "files", setSplitRatio: vi.fn() }),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import { SplitPaneLayout } from "./SplitPaneLayout"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("SplitPaneLayout suspension", () => {
  test("the session grid hides the right pane without unmounting it or rebuilding the chat", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    )
    let chatMounts = 0
    let editorMounts = 0
    const Chat = () => {
      React.useEffect(() => {
        chatMounts += 1
      }, [])
      return <div data-chat />
    }
    const Editor = () => {
      React.useEffect(() => {
        editorMounts += 1
      }, [])
      return <div data-editor />
    }
    const view = render(
      <SplitPaneLayout rightContent={<Editor />}>
        <Chat />
      </SplitPaneLayout>,
    )
    view.rerender(
      <SplitPaneLayout suspended rightContent={<Editor />}>
        <Chat />
      </SplitPaneLayout>,
    )
    const right = view.container.querySelector<HTMLElement>("[data-split-inspector]")!
    expect(right.hidden).toBe(true)
    expect(view.container.querySelector("[data-editor]")).not.toBeNull()
    view.rerender(
      <SplitPaneLayout rightContent={<Editor />}>
        <Chat />
      </SplitPaneLayout>,
    )
    expect(right.hidden).toBe(false)
    expect([chatMounts, editorMounts]).toEqual([1, 1])
  })
})
