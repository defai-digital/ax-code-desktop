import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, test, vi } from "vitest"
import { create } from "zustand"
import type { McpDraft, McpServerWithScope } from "@/stores/useMcpConfigStore"

const fixtures = vi.hoisted(() => ({ remove: vi.fn<(...args: unknown[]) => Promise<{ ok: boolean }>>(), select: vi.fn(), refreshSelected: vi.fn(() => false), draft: vi.fn(), load: vi.fn(async () => true) }))
const directory = create(() => ({ currentDirectory: "/alpha", projectPath: null as string | null }))
type ProjectState = { getActiveProject: () => { path: string } }
vi.mock("@/stores/useProjectsStore", () => ({ useProjectsStore: Object.assign(
  (selector: (state: ProjectState) => unknown) => directory(state => selector({ getActiveProject: () => ({ path: state.projectPath ?? state.currentDirectory }) })),
  { getState: () => ({ getActiveProject: () => ({ path: directory.getState().projectPath ?? directory.getState().currentDirectory }) }) },
) }))
const server = (url: string): McpServerWithScope => ({ name: "review", type: "remote", url, enabled: false, scope: "project" })
const configs = create(() => ({
  mcpServers: [server("https://alpha.invalid")], loadedDirectory: "/alpha", isLoading: false, selectedMcpName: "review",
  mcpDraft: null as McpDraft | null,
  selectionRevision: 0,
  refreshSelectedMcp: fixtures.refreshSelected,
  setSelectedMcp: fixtures.select, setMcpDraft: fixtures.draft, loadMcpConfigs: fixtures.load, deleteMcp: fixtures.remove,
}))
const empty = {}
const runtime = { getStatusForDirectory: () => empty, refresh: vi.fn(async () => undefined), getErrorForDirectory: () => null }
vi.mock("@/stores/useMcpConfigStore", () => ({ useMcpConfigStore: (selector: Parameters<typeof configs>[0]) => configs(selector) }))
vi.mock("@/stores/useDirectoryStore", () => ({ useDirectoryStore: (selector: Parameters<typeof directory>[0]) => directory(selector) }))
vi.mock("@/stores/useMcpStore", () => ({ useMcpStore: (selector: (state: typeof runtime) => unknown) => selector(runtime) }))
vi.mock("@/hooks/useWebMcpBrowser", () => ({ useWebMcpSummary: () => ({ tone: "idle", detail: "Fixture browser" }) }))
vi.mock("@/components/mcp/WebMcpBrowserTools", () => ({ WebMcpStatusDot: () => null }))
vi.mock("@/components/sections/shared/SettingsProjectSelector", () => ({ SettingsProjectSelector: () => null }))
vi.mock("@/lib/device", () => ({ isMobileDeviceViaCSS: () => false }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string, params?: { name?: string }) => params?.name ? `${key}:${params.name}` : key }) }))
vi.mock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock("@/components/ui/ScrollableOverlay", () => ({ ScrollableOverlay: ({ children }: React.PropsWithChildren) => <div>{children}</div> }))
import { McpSidebar } from "./McpSidebar"

let container: HTMLDivElement
let root: Root
let finishDelete: (value: { ok: boolean }) => void
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  fixtures.remove.mockImplementation(() => new Promise(resolve => { finishDelete = resolve }))
  directory.setState({ currentDirectory: "/alpha", projectPath: null })
  configs.setState({ mcpServers: [server("https://alpha.invalid")], loadedDirectory: "/alpha", isLoading: false })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<McpSidebar />))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const confirm = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(button => ["settings.common.actions.delete", "settings.mcp.sidebar.actions.deleting"].includes(button.textContent ?? ""))!
async function openDelete() {
  const more = container.querySelector<HTMLButtonElement>('[aria-label="settings.snippets.sidebar.actions.more:review"]')!
  await act(async () => more.click())
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(element => element.textContent?.includes("settings.common.actions.delete"))!
  await act(async () => item.click())
  expect(confirm()).toBeDefined()
}
async function switchProject() {
  await act(async () => {
    directory.setState({ currentDirectory: "/beta" })
    configs.setState({ mcpServers: [server("https://beta.invalid")], loadedDirectory: "/beta" })
  })
}

test("a different directory cannot expose old server actions before inventory arrives", async () => {
  await act(async () => directory.setState({ currentDirectory: "/beta" }))
  expect(container.textContent).not.toContain("https://alpha.invalid")
  expect(container.querySelector('[aria-label="settings.snippets.sidebar.actions.more:review"]')).toBeNull()
  expect(container.querySelector<HTMLButtonElement>('[aria-label="settings.mcp.sidebar.actions.addServerTitle"]')!.disabled).toBe(true)
  const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "settings.mcp.page.inventory.retry")!
  await act(async () => retry.click())
  expect(fixtures.load).toHaveBeenLastCalledWith({ force: true })
})

test("a project change closes a confirmation created from the old inventory", async () => {
  await openDelete()
  await switchProject()
  expect(confirm()).toBeUndefined()
  expect(fixtures.remove).not.toHaveBeenCalled()
})

test("an old delete cannot close a new project's confirmation", async () => {
  await openDelete()
  await act(async () => confirm().click())
  await switchProject()
  await openDelete()
  await act(async () => finishDelete({ ok: true }))
  expect(confirm()).toBeDefined()
  expect(confirm().disabled).toBe(false)
  expect(fixtures.refreshSelected).not.toHaveBeenCalled()
})

test("current-context deletion passes its origin and closes after acknowledgement", async () => {
  await openDelete()
  await act(async () => confirm().click())
  expect(fixtures.remove).toHaveBeenCalledWith("review", "/alpha", 0)
  await act(async () => finishDelete({ ok: true }))
  expect(confirm()).toBeUndefined()
  expect(fixtures.refreshSelected).toHaveBeenCalledWith("review", "/alpha", 0)
})

test("unexpected deletion failure releases its confirmation for retry", async () => {
  fixtures.remove.mockRejectedValueOnce(new Error("Fixture failure"))
  await openDelete()
  await act(async () => confirm().click())
  expect(confirm()).toBeDefined()
  expect(confirm().disabled).toBe(false)
})

test("user-scoped items are withheld together with stale project inventory", async () => {
  await act(async () => configs.setState({ mcpServers: [{ ...server("https://global.invalid"), scope: "user" }] }))
  expect(container.textContent).toContain("https://global.invalid")
  await act(async () => directory.setState({ currentDirectory: "/beta" }))
  expect(container.textContent).not.toContain("https://global.invalid")
})

test("an old sidebar completion cannot end the new project's pending deletion", async () => {
  await openDelete()
  await act(async () => confirm().click())
  const finishAlpha = finishDelete
  await switchProject()
  await openDelete()
  await act(async () => confirm().click())
  expect(fixtures.remove).toHaveBeenCalledTimes(2)
  await act(async () => finishAlpha({ ok: true }))
  expect(confirm().disabled).toBe(true)
  await act(async () => finishDelete({ ok: true }))
  expect(confirm()).toBeUndefined()
})

test("a worktree session deletes against the active project's inventory", async () => {
  await act(async () => directory.setState({ currentDirectory: "/alpha/worktrees/lane", projectPath: "/alpha" }))
  expect(container.querySelector<HTMLButtonElement>('[aria-label="settings.mcp.sidebar.actions.addServerTitle"]')!.disabled).toBe(false)
  await openDelete()
  await act(async () => confirm().click())
  expect(fixtures.remove).toHaveBeenCalledWith("review", "/alpha", 0)
  await act(async () => finishDelete({ ok: true }))
})
