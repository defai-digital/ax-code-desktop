import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { create } from "zustand"
import type { McpDraft, McpServerWithScope } from "@/stores/useMcpConfigStore"

type Result = { ok: boolean; message?: string; reloadFailed?: boolean; warning?: string }
const fixtures = vi.hoisted(() => ({
  save: vi.fn<(...args: unknown[]) => Promise<Result>>(), select: vi.fn(), draft: vi.fn(),
  refresh: vi.fn(async () => undefined), success: vi.fn(), error: vi.fn(), warning: vi.fn(),
  startAuth: vi.fn(async () => "https://auth.invalid/?state=fixture-alpha"),
}))
const directory = create(() => ({ currentDirectory: "/alpha" }))
const server = (url: string): Extract<McpServerWithScope, { type: "remote" }> => ({ name: "review", type: "remote", url, enabled: false, oauth: false, scope: "project" })
const configs = create(() => ({
  selectedMcpName: "review", mcpServers: [server("https://alpha.invalid")], mcpDraft: null as McpDraft | null,
  isLoading: false, getMcpByName: (name: string) => configs.getState().mcpServers.find(item => item.name === name),
  loadedDirectory: "/alpha", loadMcpConfigs: vi.fn(),
  createMcp: fixtures.save, updateMcp: fixtures.save, deleteMcp: vi.fn(),
  setSelectedMcp: fixtures.select, setMcpDraft: fixtures.draft,
}))
const runtime = { getStatusForDirectory: () => status, getDiagnosticForDirectory: () => status,
  refresh: fixtures.refresh, connect: vi.fn(), disconnect: vi.fn(), startAuth: fixtures.startAuth, completeAuth: vi.fn(),
  clearAuth: vi.fn(), testConnection: vi.fn() }
const status = {}
vi.mock("@/stores/useMcpConfigStore", () => ({
  useMcpConfigStore: (selector: Parameters<typeof configs>[0]) => configs(selector),
  envRecordToArray: (value?: Record<string, string>) => Object.entries(value ?? {}).map(([key, value]) => ({ key, value })),
}))
vi.mock("@/stores/useDirectoryStore", () => ({ useDirectoryStore: (selector: Parameters<typeof directory>[0]) => directory(selector) }))
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
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  fixtures.save.mockImplementation(() => new Promise(resolve => { resolveSave = resolve }))
  directory.setState({ currentDirectory: "/alpha" })
  configs.setState({ selectedMcpName: "review", mcpServers: [server("https://alpha.invalid")], mcpDraft: null, loadedDirectory: "/alpha" })
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
