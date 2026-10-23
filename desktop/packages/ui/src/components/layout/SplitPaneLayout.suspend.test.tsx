import React from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"

vi.mock("@/hooks/useSplitPane", () => ({
  useSplitPane: () => ({ splitEnabled: true, splitRatio: 0.5, splitRightTab: "files", setSplitRatio: vi.fn() }),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import { SplitPaneLayout } from "./SplitPaneLayout"

// Module scope: React Compiler hoists memoized callbacks out of the components it
// compiles, so components declared inside the test body would lose the counters.
const mounts = { chat: 0, editor: 0 }

function Chat() {
  React.useEffect(() => {
    mounts.chat += 1
  }, [])
  return <div data-chat />
}

function Editor() {
  React.useEffect(() => {
    mounts.editor += 1
  }, [])
  return <div data-editor />
}

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
    mounts.chat = 0
    mounts.editor = 0
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
    expect([mounts.chat, mounts.editor]).toEqual([1, 1])
  })
})
