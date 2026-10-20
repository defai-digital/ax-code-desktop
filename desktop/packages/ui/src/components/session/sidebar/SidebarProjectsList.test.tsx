import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { createDesktopUiTools } from "@/lib/desktopUiWebMcp"
import { SidebarProjectsList } from "./SidebarProjectsList"

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({ currentTheme: { metadata: { variant: "dark" }, colors: { surface: { foreground: "#fff" } } } }),
}))

test("colliding rendered labels expose one distinct working project-header action per project", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const toggle = vi.fn()
  const sections = [
    { project: { id: "a", label: "shared-project", normalizedPath: "/work/team-a/shared" }, groups: [] },
    { project: { id: "b", label: "shared_project", normalizedPath: "/work/team-b/shared" }, groups: [] },
  ]
  const props: React.ComponentProps<typeof SidebarProjectsList> = {
    sectionsForRender: sections, projectSections: sections, activeProjectId: "a", showOnlyMainWorkspace: false,
    hasSessionSearchQuery: false, emptyState: null, searchEmptyState: null, renderGroupSessions: () => null,
    homeDirectory: "/work", collapsedProjects: new Set(), hideDirectoryControls: true, projectRepoStatus: new Map(),
    isDesktopShellRuntime: true, stuckProjectHeaders: new Set(), alwaysShowActions: false, toggleProject: toggle,
    setActiveProjectIdOnly: vi.fn(), setActiveMainTab: vi.fn(), openNewSessionDraft: vi.fn(),
    openNewWorktreeDialog: vi.fn(), openProjectEditDialog: vi.fn(), removeProject: vi.fn(),
    projectHeaderSentinelRefs: { current: new Map() }, reorderProjects: vi.fn(), getOrderedGroups: (_id, groups) => groups,
    setGroupOrderByProject: vi.fn(), openSidebarMenuKey: null, setOpenSidebarMenuKey: vi.fn(), isInlineEditing: false,
  }
  try {
    act(() => root.render(<I18nProvider><SidebarProjectsList {...props} /></I18nProvider>))
    const { tools, dispose } = createDesktopUiTools(document)
    try {
      const snapshot = () => tools[0].execute({}) as { controls: Array<{ ref: string; name: string; role: string }> }
      const actions = snapshot().controls.filter(control => control.role === "button" && control.name.startsWith("Shared Project"))
      expect(actions).toHaveLength(2)
      for (const [id, path] of [["a", "~/team-a/shared"], ["b", "~/team-b/shared"]]) {
        const action = snapshot().controls.find(control => control.name.includes(path))
        expect(action).toBeDefined()
        act(() => { tools[1].execute({ ref: action!.ref }) })
        expect(toggle).toHaveBeenLastCalledWith(id)
        expect(document.activeElement?.tagName).toBe("BUTTON")
        expect(document.activeElement?.textContent).toContain(path)
        expect(document.activeElement?.getAttribute("aria-describedby")).toBeTruthy()
      }
    } finally { dispose() }
  } finally {
    act(() => root.unmount())
    container.remove()
    rects.mockRestore()
  }
})
