import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
vi.mock("@/hooks/useEffectiveDirectory", () => ({
  useEffectiveDirectory: () => useDirectoryStore((s) => s.currentDirectory),
}))
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const sessionWindow = vi.hoisted(() => ({ available: false, open: vi.fn(async () => true) }))
vi.mock("@/lib/supervision/openSessionWindow", () => ({
  canOpenSessionWindow: () => sessionWindow.available,
  openSessionWindow: sessionWindow.open,
}))
import { useUIStore } from "@/stores/useUIStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { WorkspaceNavigation } from "./WorkspaceNavigation"

describe("workspace navigation", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useDirectoryStore.setState({ currentDirectory: "/repo/project", homeDirectory: "" })
    useProjectsStore.setState({ projects: [] } as never)
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
  test("a draft can review its project without creating a session", () => {
    act(() => useSessionUIStore.setState({ currentSessionId: null }))
    click("action.reviewChanges")
    expect(useUIStore.getState().splitPaneEnabled).toBe(true)
    expect(container.querySelector("[data-workspace-directory]")).toBeNull()
    click("navigation.workspace")
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
    const context = container.querySelector("[data-workspace-directory]")
    expect(context?.getAttribute("data-workspace-directory")).toBe("/repo/project")
    expect(context?.getAttribute("title")).toBe("/repo/project")
  })
  test("names the workspace by project, short path and branch", () => {
    act(() => {
      useDirectoryStore.setState({ currentDirectory: "/home/me/code/app/packages/web", homeDirectory: "/home/me" })
      useProjectsStore.setState({
        projects: [
          { id: "outer", path: "/home/me/code", label: "Code", addedAt: 0, lastOpenedAt: 0 },
          { id: "app", path: "/home/me/code/app", label: "App", addedAt: 0, lastOpenedAt: 0 },
        ],
      } as never)
    })
    const context = container.querySelector("[data-workspace-directory]")!
    expect(context.textContent).toContain("App")
    expect(context.textContent).not.toContain("Code")
    expect(context.textContent).toContain("~/code/app/packages/web")
    expect(context.textContent).not.toContain("/home/me")
    act(() => useDirectoryStore.setState({ currentDirectory: "/home/me/code/app2" }))
    expect(container.querySelector("[data-workspace-directory]")!.textContent).not.toContain("App")
  })
  test("review is disabled without a directory", () => {
    act(() => useDirectoryStore.setState({ currentDirectory: undefined }))
    expect(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("action.reviewChanges"))
        ?.disabled,
    ).toBe(true)
  })

  test("offers to open the current session in its own window only where windows exist", () => {
    expect(container.querySelector("[data-open-session-window]")).toBeNull()
    act(() => root.unmount())
    sessionWindow.available = true
    root = createRoot(container)
    act(() => root.render(<WorkspaceNavigation />))
    const button = container.querySelector<HTMLButtonElement>("[data-open-session-window]")!
    expect(button.getAttribute("aria-label")).toBe("supervision.navigation.openInWindow")
    act(() => button.click())
    expect(sessionWindow.open).toHaveBeenCalledWith(
      { sessionId: "ses_1", directory: "/repo/project" },
      "supervision.navigation.openInWindowFailed",
    )
    sessionWindow.available = false
  })
})
