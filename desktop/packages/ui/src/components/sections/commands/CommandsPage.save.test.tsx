import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { create } from "zustand"
import type { CommandConfig } from "@/stores/useCommandsStore"

const fixtures = vi.hoisted(() => ({ save: vi.fn<() => Promise<boolean>>(), select: vi.fn(), draft: vi.fn() }))
const directory = create(() => ({ currentDirectory: "/alpha" }))
const commands = create(() => ({
  selectedCommandName: "review",
  commands: [{ name: "review", template: "Alpha", description: "" }],
  commandDraft: null as CommandConfig | null,
  isLoading: false,
  getCommandByName: (name: string): CommandConfig | undefined => commands.getState().commands.find((item) => item.name === name),
  updateCommand: fixtures.save,
  createCommand: fixtures.save,
  setSelectedCommand: fixtures.select,
  setCommandDraft: fixtures.draft,
}))
vi.mock("@/stores/useCommandsStore", () => ({ useCommandsStore: (selector: Parameters<typeof commands>[0]) => commands(selector) }))
vi.mock("@/stores/useDirectoryStore", () => ({ useDirectoryStore: (selector: Parameters<typeof directory>[0]) => directory(selector) }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("../agents/ModelSelector", () => ({ ModelSelector: () => null }))
vi.mock("./AgentSelector", () => ({ AgentSelector: () => null }))
vi.mock("@/components/ui/ScrollableOverlay", () => ({ ScrollableOverlay: ({ children }: React.PropsWithChildren) => <div>{children}</div> }))
import { CommandsPage } from "./CommandsPage"

let root: Root
let container: HTMLDivElement
let resolveSave: (value: boolean) => void
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  fixtures.save.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
  directory.setState({ currentDirectory: "/alpha" })
  commands.setState({ selectedCommandName: "review", commands: [{ name: "review", template: "Alpha", description: "" }], commandDraft: null })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<CommandsPage />))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const save = () => container.querySelector("button")!
const template = () => container.querySelector<HTMLTextAreaElement>('textarea[rows="12"]')!
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(template(), value)
    template().dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function switchProject(path: string, text: string) {
  await act(async () => {
    directory.setState({ currentDirectory: path })
    commands.setState({ commands: [{ name: "review", template: text, description: "" }] })
  })
}

test("a completed save cannot replace the baseline of the same command in another project", async () => {
  await edit("Alpha saved")
  await act(async () => save().click())
  await switchProject("/beta", "Beta")
  await act(async () => resolveSave(true))
  expect(template().value).toBe("Beta")
  // Editing and reverting must leave Beta clean, independent of Alpha's saved values.
  await edit("Beta edit")
  await edit("Beta")
  expect(save().disabled).toBe(true)
})

test("leaving and returning to a command invalidates the previous form's save", async () => {
  await edit("Alpha saved")
  await act(async () => save().click())
  await switchProject("/beta", "Beta")
  await switchProject("/alpha", "Alpha reloaded")
  await act(async () => resolveSave(true))
  await edit("temporary")
  await edit("Alpha reloaded")
  expect(save().disabled).toBe(true)
})

test("a save preserves edits entered while the same form is saving", async () => {
  await edit("Alpha saved")
  await act(async () => save().click())
  await edit("New unsaved text")
  await act(async () => resolveSave(true))
  expect(template().value).toBe("New unsaved text")
  expect(save().disabled).toBe(false)
  await edit("Alpha saved")
  expect(save().disabled).toBe(true)
})


test("a completed create does not clear or select a different project's draft", async () => {
  await act(async () => commands.setState({
    commands: [], commandDraft: { name: "review", scope: "project", template: "Draft Alpha" },
  }))
  await edit("Created Alpha")
  const saveButton = () => Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent === "settings.common.actions.saveChanges")!
  await act(async () => saveButton().click())
  expect(fixtures.save).toHaveBeenCalledTimes(1)
  await act(async () => {
    directory.setState({ currentDirectory: "/beta" })
    commands.setState({ commandDraft: { name: "review", scope: "project", template: "Draft Beta" } })
  })
  await act(async () => resolveSave(true))
  expect(template().value).toBe("Draft Beta")
  expect(fixtures.draft).not.toHaveBeenCalled()
  expect(fixtures.select).not.toHaveBeenCalled()
})

test("a successful save immediately marks unchanged submitted fields clean", async () => {
  await edit("Alpha saved")
  await act(async () => save().click())
  await act(async () => resolveSave(true))
  expect(save().disabled).toBe(true)
})


test.each(["user", "project"] as const)("draft scope %s displays its translated option label", async (scope) => {
  await act(async () => commands.setState({
    commands: [], commandDraft: { name: "review", scope, template: "Draft" },
  }))
  const scopeControl = container.querySelector('[role="combobox"]')
  expect(scopeControl?.textContent).toBe(`settings.common.scope.${scope === "user" ? "global" : "project"}`)
})

test("clearing a command description sends an explicit empty value", async () => {
  await act(async () => {
    directory.setState({ currentDirectory: "/described" })
    commands.setState({ commands: [{ name: "review", template: "Alpha", description: "Before" }] })
  })
  const field = container.querySelector<HTMLTextAreaElement>('textarea[rows="2"]')!
  expect(field.value).toBe("Before")
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "")
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => save().click())
  expect(fixtures.save).toHaveBeenCalledWith("review", expect.objectContaining({ description: "" }))
  await act(async () => resolveSave(true))
})
