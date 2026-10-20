import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { create } from "zustand"
import type { McpDraft, McpServerWithScope } from "@/stores/useMcpConfigStore"

type Result = { ok: boolean; message?: string; reloadFailed?: boolean; warning?: string; contextChanged?: boolean }
const fixtures = vi.hoisted(() => ({
  save: vi.fn<(...args: unknown[]) => Promise<Result>>(), select: vi.fn(), draft: vi.fn(),
  refresh: vi.fn(async () => undefined), success: vi.fn(), error: vi.fn(), warning: vi.fn(),
  startAuth: vi.fn(async () => "https://auth.invalid/?state=fixture-alpha"),
  remove: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  refreshSelected: vi.fn<(name: string, directory: string | null, revision?: number) => boolean>(),
}))
const directory = create(() => ({ currentDirectory: "/alpha" }))
const server = (url: string): Extract<McpServerWithScope, { type: "remote" }> => ({ name: "review", type: "remote", url, enabled: false, oauth: false, scope: "project" })
const configs = create(() => ({
  selectedMcpName: "review" as string | null, mcpServers: [server("https://alpha.invalid")], mcpDraft: null as McpDraft | null,
  isLoading: false, getMcpByName: (name: string) => configs.getState().mcpServers.find(item => item.name === name),
  loadedDirectory: "/alpha", loadMcpConfigs: vi.fn(),
  selectionRevision: 0, refreshSelectedMcp: fixtures.refreshSelected,
  createMcp: fixtures.save, updateMcp: fixtures.save, deleteMcp: fixtures.remove,
  setSelectedMcp: fixtures.select, setMcpDraft: fixtures.draft,
}))
const runtime = { getStatusForDirectory: () => status, getDiagnosticForDirectory: () => status,
  refresh: fixtures.refresh, connect: vi.fn(), disconnect: vi.fn(), startAuth: fixtures.startAuth, completeAuth: vi.fn(),
  clearAuth: vi.fn(), testConnection: vi.fn() }
const status = {}
vi.mock("@/stores/useMcpConfigStore", () => {
  const useMcpConfigStore = Object.assign(
    (selector: Parameters<typeof configs>[0]) => configs(selector),
    { getState: () => configs.getState() },
  )
  return {
    useMcpConfigStore,
    envRecordToArray: (value?: Record<string, string>) => Object.entries(value ?? {}).map(([key, value]) => ({ key, value })),
  }
})
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: Object.assign(
    (selector: Parameters<typeof directory>[0]) => directory(selector),
    { getState: () => directory.getState() },
  ),
}))
vi.mock("@/stores/useMcpStore", () => ({ useMcpStore: Object.assign(
  (selector: (value: typeof runtime) => unknown) => selector(runtime), { getState: () => runtime },
) }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { success: fixtures.success, error: fixtures.error, warning: fixtures.warning, message: vi.fn() } }))
vi.mock("@/lib/url", () => ({ openExternalUrl: vi.fn(async () => true) }))
vi.mock("@/components/mcp/WebMcpBrowserTools", () => ({ WebMcpToolsCard: () => null }))
vi.mock("./McpResourceBrowser", () => ({ McpResourceBrowser: () => null }))
vi.mock("./WebMcpAllowlistSection", () => ({ WebMcpAllowlistSection: () => null }))
vi.mock("@/components/ui/ScrollableOverlay", () => ({ ScrollableOverlay: ({ children }: React.PropsWithChildren) => <div>{children}</div> }))
import { McpPage } from "./McpPage"

let root: Root
let container: HTMLDivElement
let resolveSave: (value: Result) => void
let resolveDelete: (value: Result) => void
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  fixtures.save.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
  fixtures.remove.mockImplementation(() => new Promise(resolve => { resolveDelete = resolve }))
  directory.setState({ currentDirectory: "/alpha" })
  configs.setState({ selectedMcpName: "review", mcpServers: [server("https://alpha.invalid")], mcpDraft: null, loadedDirectory: "/alpha", selectionRevision: 0 })
  fixtures.refreshSelected.mockImplementation((name, path, revision) => {
    const state = configs.getState()
    if (directory.getState().currentDirectory !== path || state.selectedMcpName !== name || state.mcpDraft?.name === name || !state.getMcpByName(name) || (revision !== undefined && revision !== state.selectionRevision)) return false
    configs.setState({ selectionRevision: state.selectionRevision + 1 })
    return true
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<McpPage />))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const save = () => Array.from(container.querySelectorAll("button")).find(button =>
  ["settings.common.actions.saveChanges", "settings.common.actions.saving", "settings.common.actions.create"].includes(button.textContent ?? ""))!
const url = () => container.querySelector<HTMLInputElement>('input[placeholder="settings.mcp.page.connection.serverUrlPlaceholder"]')!
async function edit(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(url(), value)
    url().dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function switchProject(path: string, value: string) {
  await act(async () => {
    directory.setState({ currentDirectory: path })
    configs.setState({ mcpServers: [server(value)], loadedDirectory: path })
  })
}
const draft = (url: string): McpDraft => ({ name: "review", scope: "project", type: "remote", url,
  command: [], environment: [], headers: [], oauthEnabled: false, oauthClientId: "", oauthClientSecret: "",
  oauthScope: "", oauthRedirectUri: "", timeout: "", enabled: false })

test("late save cannot replace the baseline of the same server in another project", async () => {
  await edit("https://alpha-saved.invalid")
  await act(async () => save().click())
  await switchProject("/beta", "https://beta.invalid")
  await act(async () => resolveSave({ ok: true }))
  expect(url().value).toBe("https://beta.invalid")
  await edit("https://temporary.invalid")
  await edit("https://beta.invalid")
  expect(save().disabled).toBe(true)
})

test("a directory change cannot load the old inventory into the new project's form", async () => {
  await act(async () => directory.setState({ currentDirectory: "/beta" }))
  expect(url()).toBeNull()
  expect(fixtures.select).not.toHaveBeenCalled()
  await act(async () => configs.setState({ isLoading: true }))
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  await act(async () => configs.setState({ mcpServers: [server("https://beta.invalid")], loadedDirectory: "/beta", isLoading: false }))
  expect(url().value).toBe("https://beta.invalid")
  await edit("https://temporary.invalid")
  await edit("https://beta.invalid")
  expect(save().disabled).toBe(true)
})

test("an unmatched inventory offers a forced retry without showing editable old values", async () => {
  await act(async () => directory.setState({ currentDirectory: "/beta" }))
  expect(url()).toBeNull()
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "settings.mcp.page.inventory.retry")!
  await act(async () => retry.click())
  expect(configs.getState().loadMcpConfigs).toHaveBeenCalledWith({ force: true })
})

test("an unresolved inventory does not advertise an unavailable Add action when nothing is selected", async () => {
  await act(async () => {
    configs.setState({ selectedMcpName: null })
    directory.setState({ currentDirectory: "/beta" })
  })
  expect(container.textContent).toContain("settings.mcp.page.inventory.retry")
  expect(container.textContent).not.toContain("settings.mcp.page.empty.addNewOne")
})

test("leaving and returning invalidates the previous form completion", async () => {
  await edit("https://alpha-saved.invalid")
  await act(async () => save().click())
  await switchProject("/beta", "https://beta.invalid")
  await switchProject("/alpha", "https://alpha-reloaded.invalid")
  await act(async () => resolveSave({ ok: true }))
  await edit("https://temporary.invalid")
  await edit("https://alpha-reloaded.invalid")
  expect(save().disabled).toBe(true)
})

test("same-form save advances its baseline while preserving newer edits", async () => {
  await edit("https://submitted.invalid")
  await act(async () => save().click())
  await edit("https://unsaved.invalid")
  await act(async () => resolveSave({ ok: true }))
  expect(url().value).toBe("https://unsaved.invalid")
  expect(save().disabled).toBe(false)
  await edit("https://submitted.invalid")
  expect(save().disabled).toBe(true)
})

test("unchanged submitted values become clean immediately", async () => {
  await edit("https://submitted.invalid")
  await act(async () => save().click())
  await act(async () => resolveSave({ ok: true }))
  expect(save().disabled).toBe(true)
})

test("late create cannot clear or select another project's draft", async () => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  await edit("https://created.invalid")
  await act(async () => save().click())
  await act(async () => {
    directory.setState({ currentDirectory: "/beta" })
    configs.setState({ mcpDraft: draft("https://beta.invalid"), loadedDirectory: "/beta" })
  })
  await act(async () => resolveSave({ ok: true }))
  expect(url().value).toBe("https://beta.invalid")
  expect(fixtures.draft).not.toHaveBeenCalled()
  expect(fixtures.select).not.toHaveBeenCalled()
})

test("same-form create can complete after its inventory refresh", async () => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  await edit("https://created.invalid")
  await act(async () => save().click())
  await act(async () => configs.setState({ mcpServers: [server("https://created.invalid")] }))
  await act(async () => resolveSave({ ok: true }))
  expect(fixtures.draft).toHaveBeenCalledWith(null)
  expect(fixtures.select).toHaveBeenCalledWith("review")
})

test.each(["review", "created-name"])("creation preserves newer fields through inventory and selection: %s", async name => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  if (name !== "review") {
    const field = container.querySelector<HTMLInputElement>('input[placeholder="settings.mcp.page.server.namePlaceholder"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, name)
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  await edit("https://submitted.invalid")
  await act(async () => save().click())
  await edit("https://new-unsaved.invalid")
  // The real create store refreshes inventory before resolving its mutation result.
  await act(async () => configs.setState({ mcpServers: [{ ...server("https://submitted.invalid"), name }] }))
  expect(url().value).toBe("https://new-unsaved.invalid")
  await act(async () => resolveSave({ ok: true }))
  expect(fixtures.draft).toHaveBeenCalledWith(null)
  expect(fixtures.select).toHaveBeenCalledWith(name)
  // Apply the resulting store transitions without mocking the form itself.
  await act(async () => configs.setState({ mcpDraft: null, selectedMcpName: name }))
  expect(url().value).toBe("https://new-unsaved.invalid")
  expect(save().disabled).toBe(false)
  expect(container.textContent).toContain("settings.mcp.page.status.unsavedChanges")
  await edit("https://submitted.invalid")
  expect(save().disabled).toBe(true)
  expect(container.textContent).not.toContain("settings.mcp.page.status.unsavedChanges")
})

test("failed creation retains newer fields and permits retry", async () => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  await edit("https://submitted.invalid")
  await act(async () => save().click())
  expect(container.querySelector<HTMLInputElement>('input[placeholder="settings.mcp.page.server.namePlaceholder"]')!.disabled).toBe(true)
  expect(container.querySelector('[role="combobox"]')?.hasAttribute("disabled")).toBe(true)
  await edit("https://new-unsaved.invalid")
  await act(async () => resolveSave({ ok: false, message: "Fixture rejected creation" }))
  expect(url().value).toBe("https://new-unsaved.invalid")
  expect(save().disabled).toBe(false)
  expect(fixtures.draft).not.toHaveBeenCalled()
  expect(container.querySelector<HTMLInputElement>('input[placeholder="settings.mcp.page.server.namePlaceholder"]')!.disabled).toBe(false)
  await act(async () => save().click())
  expect(fixtures.save).toHaveBeenLastCalledWith(expect.objectContaining({ url: "https://new-unsaved.invalid" }))
  await act(async () => resolveSave({ ok: false }))
})

test("background inventory changes do not reset an edited creation draft", async () => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  await edit("https://unsaved.invalid")
  await act(async () => configs.setState({ mcpServers: [{ ...server("https://unrelated.invalid"), name: "other" }] }))
  expect(url().value).toBe("https://unsaved.invalid")
})

test("a same-name inventory arrival keeps the draft and rejects duplicate creation", async () => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  await edit("https://unsaved.invalid")
  await act(async () => configs.setState({ mcpServers: [server("https://external.invalid")] }))
  expect(url().value).toBe("https://unsaved.invalid")
  expect(save().textContent).toBe("settings.common.actions.create")
  await act(async () => save().click())
  expect(fixtures.save).not.toHaveBeenCalled()
  expect(fixtures.error).toHaveBeenCalledWith("settings.mcp.page.toast.serverNameExists")
})

test("unchanged creation becomes clean after its real draft handoff", async () => {
  await act(async () => configs.setState({ mcpServers: [], mcpDraft: draft("https://alpha.invalid") }))
  await edit("https://submitted.invalid")
  await act(async () => save().click())
  await act(async () => configs.setState({ mcpServers: [server("https://submitted.invalid")] }))
  await act(async () => resolveSave({ ok: true }))
  await act(async () => configs.setState({ mcpDraft: null, selectedMcpName: "review" }))
  expect(url().value).toBe("https://submitted.invalid")
  expect(save().disabled).toBe(true)
  expect(container.textContent).not.toContain("settings.mcp.page.status.unsavedChanges")
})

test("old completion cannot unlock a newer project's pending save", async () => {
  await edit("https://alpha-saved.invalid")
  await act(async () => save().click())
  const finishAlpha = resolveSave
  await switchProject("/beta", "https://beta.invalid")
  await edit("https://beta-saved.invalid")
  expect(save().disabled).toBe(false)
  await act(async () => save().click())
  expect(fixtures.save).toHaveBeenCalledTimes(2)
  await act(async () => finishAlpha({ ok: true }))
  expect(save().textContent).toBe("settings.common.actions.saving")
  expect(save().disabled).toBe(true)
  await act(async () => resolveSave({ ok: true }))
  expect(save().disabled).toBe(true)
})

test("navigation during pending-auth cleanup still invalidates save completion", async () => {
  let finishCleanup!: (value: Response) => void
  const cleanup = new Promise<Response>(resolve => { finishCleanup = resolve })
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) =>
    init?.method === "DELETE" ? cleanup : new Response("{}", { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  await act(async () => {
    configs.setState({ selectedMcpName: "other", mcpServers: [{ ...server("https://alpha.invalid"), name: "other", enabled: true, oauth: { redirectUri: "http://localhost/mcp/oauth/callback" } }] })
  })
  const authorize = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "settings.mcp.page.actions.reauthorize")!
  await act(async () => authorize.click())
  expect(fixtures.startAuth).toHaveBeenCalled()
  await edit("https://submitted.invalid")
  await act(async () => save().click())
  await act(async () => resolveSave({ ok: true }))
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
  await act(async () => configs.setState({ selectedMcpName: "review" }))
  await switchProject("/beta", "https://beta.invalid")
  await act(async () => finishCleanup(new Response("{}", { status: 200 })))
  await edit("https://temporary.invalid")
  await edit("https://beta.invalid")
  expect(save().disabled).toBe(true)
})

test.each([{ ok: false, message: "Rejected by fixture" }, { ok: true, reloadFailed: true, message: "Saved; reload failed", warning: "Retry" }])(
  "mutation outcome remains visible after navigation: %s", async result => {
    await edit("https://submitted.invalid")
    await act(async () => save().click())
    await switchProject("/beta", "https://beta.invalid")
    await act(async () => resolveSave(result))
    expect(result.ok ? fixtures.warning : fixtures.error).toHaveBeenCalledWith(result.message, ...(result.ok ? [{ description: "Retry" }] : []))
  },
)

const confirmDelete = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(button => ["settings.common.actions.delete", "settings.mcp.page.actions.deleting"].includes(button.textContent ?? ""))!
async function openDelete() {
  const control = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "settings.common.actions.delete")!
  await act(async () => control.click())
  expect(confirmDelete()).toBeDefined()
}

test("project switching closes the previous detail delete confirmation", async () => {
  await openDelete()
  await switchProject("/beta", "https://beta.invalid")
  expect(confirmDelete()).toBeUndefined()
})

test("an old detail deletion cannot close or unlock a newer confirmation", async () => {
  await openDelete()
  await act(async () => confirmDelete().click())
  expect(fixtures.remove).toHaveBeenCalledWith("review", "/alpha", 0)
  await switchProject("/beta", "https://beta.invalid")
  await openDelete()
  await act(async () => resolveDelete({ ok: true }))
  expect(confirmDelete()).toBeDefined()
  expect(confirmDelete().disabled).toBe(false)
})

test("a rejected stale detail action reports context change and permits retry", async () => {
  await openDelete()
  await act(async () => confirmDelete().click())
  await act(async () => resolveDelete({ ok: false, contextChanged: true }))
  expect(fixtures.error).toHaveBeenCalledWith("settings.mcp.toast.projectChanged")
  expect(confirmDelete().disabled).toBe(false)
})

test("an old detail completion cannot end a new project's pending delete", async () => {
  await openDelete()
  await act(async () => confirmDelete().click())
  const finishAlpha = resolveDelete
  await switchProject("/beta", "https://beta.invalid")
  await openDelete()
  await act(async () => confirmDelete().click())
  expect(fixtures.remove).toHaveBeenCalledTimes(2)
  await act(async () => finishAlpha({ ok: true }))
  expect(confirmDelete().disabled).toBe(true)
  await act(async () => resolveDelete({ ok: true }))
  expect(confirmDelete()).toBeUndefined()
})

test("a same-name fallback after deletion reloads the detail form and clean baseline", async () => {
  await openDelete()
  await act(async () => confirmDelete().click())
  await act(async () => configs.setState({ mcpServers: [{ ...server("https://global.invalid"), scope: "user" }] }))
  await act(async () => resolveDelete({ ok: true }))
  expect(url().value).toBe("https://global.invalid")
  expect(save().disabled).toBe(true)
  await edit("https://temporary.invalid")
  await edit("https://global.invalid")
  expect(save().disabled).toBe(true)
})

test.each(["environment", "headers"] as const)("revealed %s rows are masked again across project, server and scope handoff", async kind => {
  const record = (name: string, value: string, scope: "project" | "user" = "project") => ({
    ...server("https://fixture.invalid"), name, scope, [kind]: { FIXTURE: value },
  })
  const input = (value: string) => Array.from(container.querySelectorAll<HTMLInputElement>("input")).find(element => element.value === value)
  const showRow = async (value: string) => {
    if (!input(value)) {
      const advanced = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("settings.mcp.page.advanced.configure"))!
      await act(async () => advanced.click())
    }
    expect(input(value)?.type).toBe("password")
  }
  const reveal = async (value: string) => {
    await showRow(value)
    const toggle = input(value)!.parentElement!.querySelector<HTMLButtonElement>("button")!
    await act(async () => toggle.click())
    expect(input(value)?.type).toBe("text")
  }
  await act(async () => configs.setState({ selectedMcpName: "secrets", mcpServers: [record("secrets", "fixture-a")] }))
  await reveal("fixture-a")
  await act(async () => {
    directory.setState({ currentDirectory: "/beta" })
    configs.setState({ loadedDirectory: "/beta", mcpServers: [record("secrets", "fixture-b")] })
  })
  await reveal("fixture-b")
  await act(async () => configs.setState({ selectedMcpName: "other", mcpServers: [record("other", "fixture-c")] }))
  await reveal("fixture-c")
  await act(async () => configs.setState({ selectionRevision: 1, mcpServers: [record("other", "fixture-d", "user")] }))
  await showRow("fixture-d")
})
