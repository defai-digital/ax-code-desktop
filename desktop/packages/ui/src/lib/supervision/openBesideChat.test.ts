import { beforeEach, describe, expect, test } from "vitest"

import { useUIStore } from "@/stores/useUIStore"
import { closeBesideChat, continueAfterFilesGuard, openBesideChat, selectSplitPaneTab } from "./openBesideChat"

const dirtyFilesGuard = () => {
  const asked: string[] = []
  useUIStore.getState().setMainTabGuard((tab) => {
    asked.push(tab)
    return false
  })
  return asked
}

describe("beside-chat views and the Files unsaved-changes guard", () => {
  beforeEach(() => {
    const ui = useUIStore.getState()
    ui.setMainTabGuard(null)
    useUIStore.setState({ isMobile: false, activeMainTab: "chat" })
    ui.setSplitPaneRightTab("files")
    ui.setSplitPaneEnabled(true)
  })

  test("replacing a dirty Files pane asks the guard and keeps the editor when refused", () => {
    const asked = dirtyFilesGuard()
    expect(openBesideChat("diff")).toBe(false)
    expect(selectSplitPaneTab("git")).toBe(false)
    expect(asked).toEqual(["diff", "git"])
    expect(useUIStore.getState().splitPaneRightTab).toBe("files")
  })

  test("the terminal opens in the dock without touching the Files pane", () => {
    const asked = dirtyFilesGuard()
    expect(openBesideChat("terminal")).toBe(true)
    expect(asked).toEqual([])
    expect(useUIStore.getState().isBottomTerminalOpen).toBe(true)
    expect(useUIStore.getState().splitPaneRightTab).toBe("files")
  })

  test("a main-tab request resets to chat without asking the guard", () => {
    const asked = dirtyFilesGuard()
    useUIStore.setState({ activeMainTab: "plan" })
    openBesideChat("files")
    expect(useUIStore.getState().activeMainTab).toBe("chat")
    expect(asked).toEqual([])
  })

  test("staying on the current tab never asks the guard", () => {
    const asked = dirtyFilesGuard()
    useUIStore.getState().setActiveMainTab("chat")
    expect(asked).toEqual([])
  })

  test("closing a dirty Files pane waits for the editor's decision, then closes", () => {
    const asked = dirtyFilesGuard()
    expect(closeBesideChat("files")).toBe(false)
    expect(asked).toEqual(["chat"])
    expect(useUIStore.getState().splitPaneEnabled).toBe(true)
    useUIStore.getState().setMainTabGuard(null)
    continueAfterFilesGuard("chat")
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
  })
})
