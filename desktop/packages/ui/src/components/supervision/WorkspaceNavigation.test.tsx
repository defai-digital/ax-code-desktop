import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { WorkspaceNavigation } from "./WorkspaceNavigation"

describe("workspace navigation", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUIStore.setState({
      isMobile: false,
      activeMainTab: "chat",
      splitPaneEnabled: false,
      splitPaneRightTab: "diff",
      mainTabGuard: null,
    })
    useSupervisionStore.setState({ missionControlOpen: false, compareRunGroupKey: null })
    useSessionUIStore.setState({ currentSessionId: "ses_1" })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<WorkspaceNavigation />))
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const click = (text: string) =>
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find((b) => b.textContent?.includes(text))!
        .click(),
    )
  test("moves from comparison to the board, opens review beside chat and returns to workspace", () => {
    act(() => useSupervisionStore.setState({ compareRunGroupKey: "group" }))
    click("missionControl.title")
    expect(useSupervisionStore.getState().compareRunGroupKey).toBeNull()
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
    click("action.reviewChanges")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(false)
    expect(useUIStore.getState().splitPaneRightTab).toBe("diff")
    expect(useUIStore.getState().splitPaneEnabled).toBe(true)
    expect(useUIStore.getState().activeMainTab).toBe("chat")
    click("navigation.workspace")
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
  })
  test("an unsaved file guard prevents review navigation without losing the board", () => {
    const guard = vi.fn(() => false)
    act(() => {
      useUIStore.setState({ splitPaneEnabled: true, splitPaneRightTab: "files", mainTabGuard: guard })
      useSupervisionStore.setState({ missionControlOpen: true })
    })
    click("action.reviewChanges")
    expect(guard).toHaveBeenCalledWith("diff")
    expect(useUIStore.getState().splitPaneRightTab).toBe("files")
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
  })
  test("review is disabled without a session", () => {
    act(() => useSessionUIStore.setState({ currentSessionId: null }))
    expect(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("action.reviewChanges"))
        ?.disabled,
    ).toBe(true)
  })
})
