import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { create } from "zustand"
import type { AgentConfig } from "@/stores/useAgentsStore"

const fixtures = vi.hoisted(() => ({ save: vi.fn<(...args: unknown[]) => Promise<boolean>>(), select: vi.fn(), draft: vi.fn() }))
const directory = create(() => ({ currentDirectory: "/alpha" }))
const agents = create(() => ({
  selectedAgentName: "review",
  agents: [{ name: "review", prompt: "Alpha", description: "" }],
  agentDraft: null as AgentConfig | null,
  isLoading: false,
  getAgentByName: (name: string): AgentConfig | undefined => agents.getState().agents.find((item) => item.name === name),
  updateAgent: fixtures.save,
  createAgent: fixtures.save,
  setSelectedAgent: fixtures.select,
  setAgentDraft: fixtures.draft,
}))
vi.mock("@/stores/useAgentsStore", () => ({ useAgentsStore: (selector: Parameters<typeof agents>[0]) => agents(selector) }))
vi.mock("@/stores/useDirectoryStore", () => ({ useDirectoryStore: (selector: Parameters<typeof directory>[0]) => directory(selector) }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("./ModelSelector", () => ({ ModelSelector: () => null }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false }) }))
vi.mock("@/lib/ax-code/client", () => ({ axCodeClient: { listToolIds: async () => [] } }))
vi.mock("@/sync/sync-context", () => ({ useDirectorySync: () => ({}) }))
vi.mock("@/components/ui/ScrollableOverlay", () => ({ ScrollableOverlay: ({ children }: React.PropsWithChildren) => <div>{children}</div> }))
import { AgentsPage } from "./AgentsPage"

let root: Root
let container: HTMLDivElement
let resolveSave: (value: boolean) => void
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  fixtures.save.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
  directory.setState({ currentDirectory: "/alpha" })
  agents.setState({ selectedAgentName: "review", agents: [{ name: "review", prompt: "Alpha", description: "" }], agentDraft: null })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AgentsPage />))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const save = () => Array.from(container.querySelectorAll("button")).find((button) =>
  button.textContent === "settings.common.actions.saveChanges" || button.textContent === "settings.common.actions.saving")!
const prompt = () => container.querySelector<HTMLTextAreaElement>('textarea[rows="8"]')!
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(prompt(), value)
    prompt().dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function switchProject(path: string, text: string) {
  await act(async () => {
    directory.setState({ currentDirectory: path })
    agents.setState({ agents: [{ name: "review", prompt: text, description: "" }] })
  })
}

test("a completed save cannot replace the baseline of the same agent in another project", async () => {
  await edit("Alpha saved")
  await act(async () => save().click())
  await switchProject("/beta", "Beta")
  await act(async () => resolveSave(true))
  expect(prompt().value).toBe("Beta")
  // Editing and reverting must leave Beta clean, independent of Alpha's saved values.
  await edit("Beta edit")
  await edit("Beta")
  expect(save().disabled).toBe(true)
})

test("leaving and returning to a agent invalidates the previous form's save", async () => {
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
  expect(prompt().value).toBe("New unsaved text")
  expect(save().disabled).toBe(false)
  await edit("Alpha saved")
  expect(save().disabled).toBe(true)
})


test("a completed create does not clear or select a different project's draft", async () => {
  await act(async () => agents.setState({
    agents: [], agentDraft: { name: "review", scope: "project", prompt: "Draft Alpha" },
  }))
  await edit("Created Alpha")
  const saveButton = () => Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent === "settings.common.actions.saveChanges")!
  await act(async () => saveButton().click())
  expect(fixtures.save).toHaveBeenCalledTimes(1)
  await act(async () => {
    directory.setState({ currentDirectory: "/beta" })
    agents.setState({ agentDraft: { name: "review", scope: "project", prompt: "Draft Beta" } })
  })
  await act(async () => resolveSave(true))
  expect(prompt().value).toBe("Draft Beta")
  expect(fixtures.draft).not.toHaveBeenCalled()
  expect(fixtures.select).not.toHaveBeenCalled()
})

test("a successful save immediately marks unchanged submitted fields clean", async () => {
  await edit("Alpha saved")
  await act(async () => save().click())
  await act(async () => resolveSave(true))
  expect(save().disabled).toBe(true)
})

test("a same-form create still selects its agent after the store refreshes the list", async () => {
  await act(async () => agents.setState({
    agents: [], agentDraft: { name: "review", scope: "project", prompt: "Draft Alpha" },
  }))
  await edit("Created Alpha")
  await act(async () => save().click())
  // createAgent refreshes the agent list before resolving, but leaves draft/selection to the form.
  await act(async () => agents.setState({ agents: [{ name: "review", prompt: "Created Alpha", description: "" }] }))
  await act(async () => resolveSave(true))
  expect(fixtures.draft).toHaveBeenCalledWith(null)
  expect(fixtures.select).toHaveBeenCalledWith("review")
})


test.each(["user", "project"] as const)("draft scope %s displays its translated option label", async (scope) => {
  await act(async () => agents.setState({
    agents: [], agentDraft: { name: "review", scope, prompt: "Draft" },
  }))
  const scopeControl = container.querySelector('[role="combobox"]')
  expect(scopeControl?.textContent).toBe(`settings.common.scope.${scope === "user" ? "global" : "project"}`)
})


async function globalPatternDraft(pattern: string) {
  await act(async () => agents.setState({
    agents: [], agentDraft: {
      name: "review", scope: "project", prompt: "Draft",
      permission: { "*": Object.fromEntries([["*", "deny"], [pattern, "allow"]]) },
    },
  }))
}

test("shows existing wildcard-permission patterns in the advanced editor", async () => {
  await globalPatternDraft("src/public/**")
  const advanced = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent === "settings.agents.page.permissions.advancedEditor")!
  await act(async () => advanced.click())
  expect(container.textContent).toContain("src/public/**")
})

test.each(["src/public/**", "__proto__"])("preserves wildcard permission pattern %s on an unrelated edit", async (pattern) => {
  await globalPatternDraft(pattern)
  await edit("Updated prompt")
  await act(async () => save().click())
  expect(fixtures.save).toHaveBeenCalledTimes(1)
  const payload = JSON.parse(JSON.stringify(fixtures.save.mock.calls[0][0]))
  expect(payload).toEqual(expect.objectContaining({
    permission: { "*": Object.fromEntries([["*", "deny"], [pattern, "allow"]]) },
  }))
  expect(Object.keys(payload.permission["*"])).toEqual(["*", pattern])
  await act(async () => resolveSave(true))
})


test("retains named-tool patterns alongside wildcard patterns in the JSON payload", async () => {
  const permission = {
    "*": { "*": "deny" as const, "src/public/**": "allow" as const },
    bash: Object.fromEntries([["*", "ask"], ["__proto__", "deny"]] as const),
  }
  await act(async () => agents.setState({
    agents: [], agentDraft: { name: "review", scope: "project", prompt: "Draft", permission },
  }))
  await edit("Updated prompt")
  await act(async () => save().click())
  expect(JSON.parse(JSON.stringify(fixtures.save.mock.calls[0][0])).permission).toEqual(permission)
  await act(async () => resolveSave(true))
})

test("custom pattern choices exclude action-only permissions but retain pattern-capable tools", async () => {
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label)!
  await act(async () => button("settings.agents.page.permissions.advancedEditor").click())
  await act(async () => button("settings.agents.page.permissions.permissionPlaceholder").click())
  const options = Array.from(document.querySelectorAll('[role="option"]')).map((item) => item.textContent)
  expect(options).toContain("Bash")
  expect(options).toContain("settings.agents.page.permissions.defaultLabel")
  expect(options).not.toContain("WebFetch")
})

test("clearing the agent prompt sends an explicit empty value", async () => {
  await edit("")
  await act(async () => save().click())
  expect(fixtures.save).toHaveBeenCalledWith("review", expect.objectContaining({ prompt: "", description: "" }))
  await act(async () => resolveSave(true))
})
