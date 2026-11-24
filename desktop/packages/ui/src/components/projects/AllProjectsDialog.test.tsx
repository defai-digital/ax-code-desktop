import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const mocks = vi.hoisted(() => ({
  openNewSessionDraft: vi.fn(),
  setActiveMainTab: vi.fn(),
  homeProps: null as null | { onOpenProject?: (id: string) => void; onNewSession?: (id: string) => void },
}))

vi.mock("@/components/projects/ProjectsHome", () => ({
  ProjectsHome: (props: { onOpenProject?: (id: string) => void; onNewSession?: (id: string) => void }) => {
    mocks.homeProps = props
    return <div data-testid="projects-home" />
  },
}))

const { AllProjectsDialog } = await import("./AllProjectsDialog")
const { useUIStore } = await import("@/stores/useUIStore")
const { useSessionUIStore } = await import("@/sync/session-ui-store")
const { useProjectsStore } = await import("@/stores/useProjectsStore")

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  useUIStore.setState({ isAllProjectsOpen: false, setActiveMainTab: mocks.setActiveMainTab })
  useSessionUIStore.setState({ currentSessionId: "ses_1", openNewSessionDraft: mocks.openNewSessionDraft })
  useProjectsStore.setState({ projects: [{ id: "p2", path: "/work/other", addedAt: 1 }] as never })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

const renderDialog = async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <AllProjectsDialog />
      </I18nProvider>,
    )
  })
}

const listShown = () => document.querySelector('[data-testid="projects-home"]') !== null

test("opens over the current session without moving it", async () => {
  await renderDialog()
  expect(listShown()).toBe(false)

  await act(async () => {
    useUIStore.getState().setAllProjectsOpen(true)
  })

  expect(listShown()).toBe(true)
  expect(document.body.textContent).toContain("All projects")
  expect(useSessionUIStore.getState().currentSessionId).toBe("ses_1")
  expect(mocks.openNewSessionDraft).not.toHaveBeenCalled()
})

test("starting a session in a project closes the list and opens a draft there", async () => {
  await renderDialog()
  await act(async () => {
    useUIStore.getState().setAllProjectsOpen(true)
  })

  await act(async () => {
    mocks.homeProps?.onNewSession?.("p2")
  })

  expect(useUIStore.getState().isAllProjectsOpen).toBe(false)
  expect(mocks.setActiveMainTab).toHaveBeenCalledWith("chat")
  expect(mocks.openNewSessionDraft).toHaveBeenCalledWith({ directoryOverride: "/work/other" })
})

test("closes once a session is opened from inside the list", async () => {
  await renderDialog()
  await act(async () => {
    useUIStore.getState().setAllProjectsOpen(true)
  })
  expect(useUIStore.getState().isAllProjectsOpen).toBe(true)

  // A Needs-you row opens its session directly.
  await act(async () => {
    useSessionUIStore.setState({ currentSessionId: "ses_2" })
  })

  expect(useUIStore.getState().isAllProjectsOpen).toBe(false)
})

test("a session change while the list is closed does not count against the next opening", async () => {
  await renderDialog()
  await act(async () => {
    useSessionUIStore.setState({ currentSessionId: "ses_3" })
  })
  await act(async () => {
    useUIStore.getState().setAllProjectsOpen(true)
  })

  expect(useUIStore.getState().isAllProjectsOpen).toBe(true)
  expect(listShown()).toBe(true)
})
