import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { createDesktopUiTools } from "@/lib/desktopUiWebMcp"
import { SettingsProjectSelector } from "./SettingsProjectSelector"

const fixture = vi.hoisted(() => ({ projects: [
  { id: "a", path: "/work/team-a/app", label: "shared-project" },
  { id: "b", path: "/work/team-b/app", label: "shared_project" },
], activeProjectId: "a", setActiveProject: vi.fn() }))
vi.mock("@/stores/useProjectsStore", () => ({ useProjectsStore: (select: (state: typeof fixture) => unknown) => select(fixture) }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  fixture.projects[0].label = "shared-project"
  fixture.projects[1].label = "shared_project"
  fixture.projects = [...fixture.projects]
  fixture.activeProjectId = "a"
  vi.clearAllMocks()
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
const render = async () => { await act(async () => root.render(<I18nProvider><SettingsProjectSelector /></I18nProvider>)) }
const click = async (name: string) => {
  const { tools, dispose } = createDesktopUiTools(document)
  try {
    const state = tools[0].execute({}) as { controls: Array<{ name: string; ref: string }> }
    const matches = state.controls.filter(control => control.name === name)
    expect(matches, state.controls.map(control => control.name).join(" | ")).toHaveLength(1)
    await act(async () => { tools[1].execute({ ref: matches[0].ref }) })
  } finally { dispose() }
}

test.each(["a", "b"])("formatted collisions select the correct ID from active project %s", async (active) => {
  fixture.activeProjectId = active
  const destination = active === "a" ? "b" : "a"
  await render()
  expect(container.textContent).toContain(`/work/team-${active}/app`)
  await click("Switch project")
  expect(document.body.textContent).toContain(`/work/team-${destination}/app`)
  await click(`Shared Project · /work/team-${destination}/app`)
  expect(fixture.setActiveProject).toHaveBeenLastCalledWith(destination)
  expect(container.querySelector('[aria-label="Switch project"]')?.getAttribute("aria-expanded")).toBe("false")
  fixture.activeProjectId = destination
  await render()
  expect(container.textContent).toContain(`/work/team-${destination}/app`)
  await click("Switch project")
  await click(`Shared Project · /work/team-${active}/app`)
  expect(fixture.setActiveProject).toHaveBeenLastCalledWith(active)
})

test("unique names stay concise", async () => {
  fixture.projects[0].label = "Alpha"
  fixture.projects[1].label = "Beta"
  await render()
  expect(container.textContent).toBe("Alpha")
  await click("Switch project")
  await click("Beta")
  expect(fixture.setActiveProject).toHaveBeenLastCalledWith("b")
})

test("basename collisions are disambiguated", async () => {
  fixture.projects.forEach(project => { project.label = "" })
  fixture.projects = [...fixture.projects]
  await render()
  expect(container.textContent).toContain("/work/team-a/app")
  await click("Switch project")
  await click("App · /work/team-b/app")
  expect(fixture.setActiveProject).toHaveBeenLastCalledWith("b")
})

test("whitespace-normalized accessible names cannot silently collide", async () => {
  fixture.projects[0].label = "Shared   Project"
  fixture.projects[1].label = "Shared Project"
  await render()
  await click("Switch project")
  await click("Shared Project · /work/team-b/app")
  expect(fixture.setActiveProject).toHaveBeenCalledWith("b")
})
