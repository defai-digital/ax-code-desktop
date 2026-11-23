import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ openFolder: vi.fn() }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/projectOpen", () => ({ openProjectFolder: mocks.openFolder }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))

import { ADD_PROVIDER_ID } from "@/lib/settings/addProvider"
import { useConfigStore } from "@/stores/useConfigStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useUIStore } from "@/stores/useUIStore"
import { DraftSetupSteps } from "./DraftSetupSteps"

type ConfigState = ReturnType<typeof useConfigStore.getState>
type ProjectsState = ReturnType<typeof useProjectsStore.getState>

let root: Root
let container: HTMLDivElement
let savedConfig: Partial<ConfigState>
let savedProjects: ProjectsState["projects"]

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const config = useConfigStore.getState()
  savedConfig = {
    isInitialized: config.isInitialized,
    providers: config.providers,
    currentProviderId: config.currentProviderId,
    currentModelId: config.currentModelId,
    selectedProviderId: config.selectedProviderId,
  }
  savedProjects = useProjectsStore.getState().projects
  mocks.openFolder.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useConfigStore.setState(savedConfig)
  useProjectsStore.setState({ projects: savedProjects })
  useUIStore.setState({ isSettingsDialogOpen: false })
})

const setWorkspace = (options: { projects: number; models: number; selected: boolean }) => {
  useProjectsStore.setState({
    projects: Array.from({ length: options.projects }, (_, index) => ({ id: `p${index}`, path: `/p${index}` })) as never,
  })
  useConfigStore.setState({
    isInitialized: true,
    providers: options.models > 0 ? ([{ id: "prov", models: [{ id: "m" }] }] as never) : [],
    currentProviderId: options.selected ? "prov" : "",
    currentModelId: options.selected ? "m" : "",
  })
}
const render = () => act(() => root.render(<DraftSetupSteps />))
const steps = () =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-draft-setup-step]")).map(
    (step) => step.dataset.draftSetupStep,
  )
const actionOf = (step: string) =>
  container.querySelector<HTMLElement>(`[data-draft-setup-step="${step}"]`)!.querySelector("button")!

test("a first run lists adding a project, then connecting a provider, inside the draft", () => {
  setWorkspace({ projects: 0, models: 0, selected: false })
  render()
  expect(steps()).toEqual(["project", "connect"])
  expect(container.textContent).toContain("chat.draftSetup.subtitle")
})

test("a set-up workspace shows no steps", () => {
  setWorkspace({ projects: 1, models: 1, selected: true })
  render()
  expect(container.querySelector("[data-draft-setup]")).toBeNull()
})

test("connecting a provider opens Settings on the add-provider form, over the draft", () => {
  setWorkspace({ projects: 1, models: 0, selected: false })
  const tabBefore = useUIStore.getState().activeMainTab
  render()
  act(() => actionOf("connect").click())
  expect(useUIStore.getState()).toMatchObject({ isSettingsDialogOpen: true, settingsPage: "providers" })
  expect(useConfigStore.getState().selectedProviderId).toBe(ADD_PROVIDER_ID)
  // Settings is a dialog: the view under it, and the composer holding the prompt, stay mounted.
  expect(useUIStore.getState().activeMainTab).toBe(tabBefore)
})

test("adding a project opens the folder picker; choosing a model opens the model selector", () => {
  setWorkspace({ projects: 0, models: 1, selected: false })
  render()
  expect(steps()).toEqual(["project", "choose"])
  act(() => actionOf("project").click())
  expect(mocks.openFolder).toHaveBeenCalledOnce()
  act(() => useUIStore.getState().setModelSelectorOpen(false))
  act(() => actionOf("choose").click())
  expect(useUIStore.getState().isModelSelectorOpen).toBe(true)
  act(() => useUIStore.getState().setModelSelectorOpen(false))
})

test("the steps leave once the missing pieces arrive", () => {
  setWorkspace({ projects: 0, models: 0, selected: false })
  render()
  expect(steps()).toEqual(["project", "connect"])
  act(() => setWorkspace({ projects: 1, models: 1, selected: true }))
  expect(container.querySelector("[data-draft-setup]")).toBeNull()
})
