import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
const fixtures = vi.hoisted(() => ({
  commands: [{ name: "analysis-output", source: "skill", description: "Analyze data" }],
  skills: [], messages: [], refresh: vi.fn(), t: (key: string) => key,
}))
vi.mock("@/stores/useCommandsStore", () => ({ useCommandsStore: (selector: (value: unknown) => unknown) => selector({ commands: fixtures.commands, loadCommands: fixtures.refresh }) }))
vi.mock("@/stores/useSkillsStore", () => ({ useSkillsStore: (selector: (value: unknown) => unknown) => selector({ skills: fixtures.skills, loadSkills: fixtures.refresh }) }))
vi.mock("@/sync/session-ui-store", () => ({ useSessionUIStore: (selector: (value: unknown) => unknown) => selector({ currentSessionId: "session", newSessionDraft: null }) }))
vi.mock("@/sync/sync-context", () => ({ useSessionMessages: () => fixtures.messages }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: fixtures.t }) }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => <span /> }))
vi.mock("@/components/ui/ScrollableOverlay", () => ({ ScrollableOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
import { CommandAutocomplete, type CommandAutocompleteHandle } from "./CommandAutocomplete"

test("runtime builtin skill is discoverable and selectable without a filesystem skill entry", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  const root = createRoot(container)
  const onSelect = vi.fn()
  const handle = React.createRef<CommandAutocompleteHandle>()
  await act(async () => root.render(<CommandAutocomplete ref={handle} searchQuery="analysis-output" onCommandSelect={onSelect} onClose={() => {}} />))
  expect(container.textContent).toContain("/analysis-output")
  act(() => { handle.current!.handleKeyDown("Enter") })
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: "analysis-output", source: "skill", isSkill: true }))
  act(() => root.unmount())
})
