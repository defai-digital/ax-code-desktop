import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { create } from "zustand"

const directory = create(() => ({ currentDirectory: "/alpha" }))
const agents = create(() => ({
  selectedAgentName: "review",
  agents: [{ name: "review", prompt: "Alpha", description: "" }],
  setSelectedAgent: vi.fn(),
  setAgentDraft: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  loadAgents: vi.fn(async () => true),
}))

vi.mock("@/stores/useAgentsStore", () => ({
  useAgentsStore: (selector: (state: ReturnType<typeof agents.getState>) => unknown) => selector(agents.getState()),
  isAgentBuiltIn: () => false,
  isAgentManageable: () => true,
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: Object.assign(
    (selector: (state: { currentDirectory: string }) => unknown) => selector(directory.getState()),
    { getState: () => directory.getState() },
  ),
}))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/sections/shared/SettingsProjectSelector", () => ({ SettingsProjectSelector: () => null }))
vi.mock("@/components/ui/ScrollableOverlay", () => ({
  ScrollableOverlay: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

import { AgentsSidebar } from "./AgentsSidebar"
import { useUIStore } from "@/stores/useUIStore"

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  useUIStore.setState({ isMobile: true })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AgentsSidebar />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const row = () =>
  Array.from(container.querySelectorAll("span")).find((element) => element.textContent === "review")!.closest("div.group")!

async function openContextMenu() {
  await act(async () => {
    row().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
  })
}

test("a row's context menu follows the store's mobile flag, not the mount-time breakpoint", async () => {
  await openContextMenu()
  expect(document.body.textContent).not.toContain("settings.common.actions.duplicate")

  await act(async () => {
    useUIStore.setState({ isMobile: false })
  })
  await openContextMenu()
  expect(document.body.textContent).toContain("settings.common.actions.duplicate")
})
