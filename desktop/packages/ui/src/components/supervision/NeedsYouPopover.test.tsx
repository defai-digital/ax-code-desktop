import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => [] }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))

import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { NeedsYouPopover } from "./NeedsYouPopover"

describe("NeedsYouPopover", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useSupervisionStore.setState({
      missionControlOpen: false,
      needsYouPopoverOpen: true,
      compareRunGroupKey: "run-group",
      recentSessionIds: [],
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("opening Mission Control closes an open compare view", () => {
    const onClose = vi.fn()
    act(() => root.render(<NeedsYouPopover onClose={onClose} />))
    const button = Array.from(container.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("supervision.needsYou.openMissionControl"),
    )
    if (!button) throw new Error("Open Mission Control button not rendered")

    act(() => button.click())

    const supervision = useSupervisionStore.getState()
    expect(supervision.missionControlOpen).toBe(true)
    expect(supervision.needsYouPopoverOpen).toBe(false)
    expect(supervision.compareRunGroupKey).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
