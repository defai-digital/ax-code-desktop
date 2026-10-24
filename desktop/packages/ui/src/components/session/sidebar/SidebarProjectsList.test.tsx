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

for (const enabled of [true, false]) {
  test(`project menu exposes a red Archive all scoped to its project (enabled: ${enabled})`, async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    const archive = vi.fn(), close = vi.fn(), rename = vi.fn(), pin = vi.fn(), toggle = vi.fn()
    const sections = [
      { project: { id: "a", label: "Shared", normalizedPath: "/work/a" }, groups: [] },
      { project: { id: "b", label: "Shared", normalizedPath: "/work/b" }, groups: [] },
    ]
    function Harness() {
      const [menu, setMenu] = React.useState<string | null>(null)
      return <I18nProvider><SidebarProjectsList
        sectionsForRender={sections} projectSections={sections} activeProjectId="a" showOnlyMainWorkspace={false}
        hasSessionSearchQuery={false} emptyState={null} searchEmptyState={null} renderGroupSessions={() => null}
        homeDirectory="/work" collapsedProjects={new Set()} hideDirectoryControls projectRepoStatus={new Map()}
        isDesktopShellRuntime stuckProjectHeaders={new Set()} alwaysShowActions toggleProject={toggle}
        setActiveProjectIdOnly={vi.fn()} setActiveMainTab={vi.fn()} openNewSessionDraft={vi.fn()}
        openNewWorktreeDialog={vi.fn()} openProjectEditDialog={rename} removeProject={close} setProjectPinned={pin}
        archiveProject={archive} canArchiveProject={() => enabled}
        projectHeaderSentinelRefs={{ current: new Map() }} reorderProjects={vi.fn()} getOrderedGroups={(_id, groups) => groups}
        setGroupOrderByProject={vi.fn()} openSidebarMenuKey={menu} setOpenSidebarMenuKey={setMenu} isInlineEditing={false}
      /></I18nProvider>
    }
    try {
      await act(async () => root.render(<Harness />))
      const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.getAttribute("aria-label")?.startsWith("Project menu") && button.getAttribute("aria-label")?.includes("~/b"))!
      expect(trigger).toBeDefined()
      await act(async () => trigger.click())
      const menu = document.querySelector('[role="menu"]')!
      expect(menu).not.toBeNull()
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      expect(items.map(item => item.textContent?.trim())).toEqual(["Rename", "Pin project", "Archive all", "Close project"])
      const item = items[2]
      expect(item.dataset.variant).toBe("destructive")
      expect(item.getAttribute("aria-disabled") === "true").toBe(!enabled)
      await act(async () => item.click())
      if (enabled) expect(archive).toHaveBeenCalledWith("b")
      else expect(archive).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
      expect(rename).not.toHaveBeenCalled()
      expect(pin).not.toHaveBeenCalled()
      expect(toggle).not.toHaveBeenCalled()
    } finally { act(() => root.unmount()); container.remove() }
  })
}
