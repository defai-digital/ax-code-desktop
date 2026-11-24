import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useUIStore } from "@/stores/useUIStore"
import { SidebarHeader } from "./SidebarHeader"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  useUIStore.setState({ isAllProjectsOpen: false })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useUIStore.setState({ isAllProjectsOpen: false })
})

const props = {
  hideDirectoryControls: false,
  showRecentControls: false,
  handleOpenDirectoryDialog: vi.fn(),
  openNewSessionDraft: vi.fn(),
  canOpenMultiRun: true,
  openMultiRunLauncher: vi.fn(),
  headerActionIconClass: "",
  headerActionButtonClass: "",
  isSessionSearchOpen: false,
  setIsSessionSearchOpen: vi.fn(),
  sessionSearchInputRef: { current: null },
  sessionSearchQuery: "",
  setSessionSearchQuery: vi.fn(),
  hasSessionSearchQuery: false,
  searchMatchCount: 0,
  collapseAllProjects: vi.fn(),
  expandAllProjects: vi.fn(),
  openScheduledTasks: vi.fn(),
  scheduledTasksExpanded: false,
  selectionModeEnabled: false,
  onToggleSelectionMode: vi.fn(),
}

test("All projects opens the project list and leaves the session where it is", async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <SidebarHeader {...props} />
        </TooltipProvider>
      </I18nProvider>,
    )
  })
  const link = container.querySelector<HTMLButtonElement>("[data-sidebar-all-projects]")
  expect(link?.textContent).toBe("All projects")

  await act(async () => {
    link?.click()
  })

  expect(useUIStore.getState().isAllProjectsOpen).toBe(true)
  expect(props.openNewSessionDraft).not.toHaveBeenCalled()
})
