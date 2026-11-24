import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
vi.mock("@/hooks/useEffectiveDirectory", () => ({
  useEffectiveDirectory: () => useDirectoryStore((s) => s.currentDirectory),
}))
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
// The menu's items are rendered inline: what is tested is which views it offers and what picking one does.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div data-menu>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    ...rest
  }: { children: React.ReactNode; onSelect?: () => void } & Record<string, unknown>) => (
    <button type="button" role="menuitem" onClick={() => onSelect?.()} {...rest}>
      {children}
    </button>
  ),
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
  test("keeps Workspace and Portfolio as the primary areas", () => {
    const labels = Array.from(container.querySelectorAll("nav button[aria-pressed]")).map((b) => b.textContent ?? "")
    expect(labels).toHaveLength(2)
    expect(labels[0]).toContain("navigation.workspace")
    expect(labels[1]).toContain("navigation.portfolio")
    expect(container.textContent).not.toContain("action.reviewChanges")
    expect(container.querySelector("[data-open-session-window]")).toBeNull()
    expect(container.querySelectorAll('[data-navigation-level="primary"]')).toHaveLength(2)
  })
  test("moves from comparison to the board and returns from review to the workspace", () => {
    act(() => useSupervisionStore.setState({ compareRunGroupKey: "group" }))
    click("navigation.portfolio")
    expect(useSupervisionStore.getState().compareRunGroupKey).toBeNull()
    expect(useSupervisionStore.getState().missionControlOpen).toBe(true)
    act(() => {
      useSupervisionStore.setState({ missionControlOpen: false })
      useUIStore.setState({ splitPaneEnabled: true, splitPaneRightTab: "diff" })
    })
    expect(container.querySelector("[data-workspace-directory]")).toBeNull()
    click("navigation.workspace")
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
    expect(useUIStore.getState().activeMainTab).toBe("chat")
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    const context = container.querySelector("[data-workspace-directory]")
    expect(context?.getAttribute("data-workspace-directory")).toBe("/repo/project")
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
})

describe("workspace navigation on mobile", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useDirectoryStore.setState({ currentDirectory: "/repo/project", homeDirectory: "" })
    useProjectsStore.setState({ projects: [] } as never)
    useUIStore.setState({
      isMobile: true,
      activeMainTab: "chat",
      splitPaneEnabled: false,
      splitPaneRightTab: "files",
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
    useUIStore.setState({ isMobile: false })
  })
  const menuButton = () => container.querySelector<HTMLButtonElement>("[data-workspace-tools-menu]")!
  const tool = (view: string) => container.querySelector<HTMLButtonElement>(`[data-workspace-tool="${view}"]`)!
  const pressed = () =>
    Array.from(container.querySelectorAll('nav button[aria-pressed="true"]')).map((b) => b.textContent ?? "")

  test("Review, Git, Files and Terminal are one menu named after the view it shows", () => {
    expect(menuButton().textContent).toContain("supervision.navigation.review")
    expect(Array.from(container.querySelectorAll('[role="menuitem"]')).map((item) => item.getAttribute("data-workspace-tool"))).toEqual(
      ["diff", "git", "files", "terminal", "chat"],
    )
    // No separate Review button beside the menu.
    expect(container.querySelectorAll('[data-navigation-level="context"]')).toHaveLength(0)

    act(() => tool("git").click())

    expect(useUIStore.getState().activeMainTab).toBe("git")
    expect(menuButton().textContent).toContain("splitPane.tab.git")
    expect(tool("git").getAttribute("aria-current")).toBe("page")
  })

  test("Workspace is not pressed while Review covers the chat", () => {
    expect(pressed()).toEqual(["supervision.navigation.workspace"])

    act(() => tool("diff").click())

    // The desktop split pane is closed; on mobile Review is the main tab, and that is what the state follows.
    expect(useUIStore.getState().activeMainTab).toBe("diff")
    expect(useUIStore.getState().splitPaneEnabled).toBe(false)
    expect(pressed()).toEqual([])
    expect(menuButton().className).toContain("text-primary")

    act(() => tool("chat").click())
    expect(useUIStore.getState().activeMainTab).toBe("chat")
    expect(pressed()).toEqual(["supervision.navigation.workspace"])
  })

  test("picking Review from the board leaves the board", () => {
    act(() => useSupervisionStore.setState({ missionControlOpen: true }))
    act(() => tool("diff").click())
    expect(useSupervisionStore.getState().missionControlOpen).toBe(false)
    expect(useUIStore.getState().activeMainTab).toBe("diff")
  })
})
