import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const t = (key: string) => key

let skillsState: Record<string, unknown>
let currentDirectory = "/project"

const getSkillByName = vi.fn<() => { name: string; path: string } | null>(() => null)
const getSkillDetail = vi.fn()
const createSkill = vi.fn()
const updateSkill = vi.fn()
const setSkillDraft = vi.fn()
const setSelectedSkill = vi.fn()

vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t }) }))
vi.doMock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.doMock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ currentTheme: {} }) }))
vi.doMock("@/lib/codemirror/flexokiTheme", () => ({ createFlexokiCodeMirrorTheme: () => [] }))
vi.doMock("@/components/ui/CodeMirrorEditor", () => ({
  CodeMirrorEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    React.createElement("textarea", {
      value,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    }),
}))
vi.doMock("@/components/ui/ScrollableOverlay", () => ({
  ScrollableOverlay: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
}))
vi.doMock("@/components/views/PreviewToggleButton", () => ({ PreviewToggleButton: () => null }))
vi.doMock("@/components/chat/MarkdownRenderer", () => ({ SimpleMarkdownRenderer: () => null }))
vi.doMock("./catalog/SkillsCatalogPage", () => ({ SkillsCatalogPage: () => null }))
vi.doMock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (selector: (state: { currentDirectory: string }) => unknown) =>
    selector({ currentDirectory }),
}))
vi.doMock("@/stores/useSkillsStore", () => ({
  useSkillsStore: (selector: (state: Record<string, unknown>) => unknown) => selector(skillsState),
}))

const { SkillsPage } = await import("./SkillsPage")

describe("SkillsPage new-skill draft", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() => {
      root.render(<SkillsPage />)
    })
  }

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  const nameInput = () =>
    container.querySelector<HTMLInputElement>('input[placeholder="settings.skills.page.field.skillNamePlaceholder"]')
  const descriptionInput = () =>
    container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="settings.skills.page.field.descriptionPlaceholder"]',
    )

  const typeInto = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const prototype =
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getSkillByName.mockReturnValue(null)
    currentDirectory = "/project"
    skillsState = {
      selectedSkillName: "new-skill",
      getSkillByName,
      getSkillDetail,
      createSkill,
      updateSkill,
      skills: [],
      skillDraft: { name: "new-skill", scope: "user", source: "ax-code", description: "" },
      isLoading: false,
      setSkillDraft,
      setSelectedSkill,
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
  })

  test("a background skills reload keeps what the user typed in a new-skill draft", async () => {
    render()
    await settle()
    expect(nameInput()?.value).toBe("new-skill")

    await act(async () => {
      typeInto(nameInput()!, "my-skill")
      typeInto(descriptionInput()!, "my description")
    })
    expect(nameInput()?.value).toBe("my-skill")
    expect(descriptionInput()?.value).toBe("my description")

    // An unrelated delete invalidates and reloads the skills list: the page re-renders with a new
    // array and the load effect runs again. It must not re-apply the original empty draft.
    skillsState.skills = [{ name: "other-skill", scope: "user", source: "ax-code", description: "" }]
    render()
    await settle()

    expect(nameInput()?.value).toBe("my-skill")
    expect(descriptionInput()?.value).toBe("my description")
  })
  test("a completed create cannot clear another project's new skill draft", async () => {
    let finish!: (value: boolean) => void
    createSkill.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render()
    await settle()
    await act(async () => typeInto(descriptionInput()!, "Alpha description"))
    const saveButton = () => Array.from(container.querySelectorAll("button")).find(button =>
      ["settings.skills.page.actions.createSkill", "settings.common.actions.saveChanges", "settings.common.actions.saving"].includes(button.textContent ?? ""))!
    await act(async () => saveButton().click())
    expect(createSkill).toHaveBeenCalledTimes(1)
    currentDirectory = "/other"
    skillsState.skillDraft = { name: "new-skill", scope: "user", source: "ax-code", description: "Beta description" }
    render()
    await settle()
    await act(async () => finish(true))
    expect(descriptionInput()?.value).toBe("Beta description")
    expect(setSkillDraft).not.toHaveBeenCalled()
    expect(setSelectedSkill).not.toHaveBeenCalled()
  })

  test("clearing persisted skill instructions sends an explicit empty value", async () => {
    skillsState.selectedSkillName = "review"
    skillsState.skillDraft = null
    getSkillByName.mockReturnValue({ name: "review", path: "/project/review/SKILL.md" })
    getSkillDetail.mockResolvedValue({ sources: { md: { description: "Description", instructions: "Alpha" } } })
    updateSkill.mockResolvedValue(true)
    render()
    await settle()
    const editor = container.querySelector<HTMLTextAreaElement>("textarea:not([placeholder])")!
    await act(async () => typeInto(editor, "---\ndescription: Description\n---\n"))
    const save = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "settings.common.actions.saveChanges")!
    await act(async () => save.click())
    expect(updateSkill).toHaveBeenCalledWith("review", expect.objectContaining({ instructions: "", targetPath: "/project/review/SKILL.md" }))
  })

  test("an old update cannot overwrite the new project's skill baseline", async () => {
    let finish!: (value: boolean) => void
    skillsState.selectedSkillName = "review"
    skillsState.skillDraft = null
    getSkillByName.mockReturnValue({ name: "review", path: "/project/review/SKILL.md" })
    getSkillDetail.mockResolvedValue({ sources: { md: { description: "Description", instructions: "Alpha" } } })
    updateSkill.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render()
    await settle()
    const editor = () => container.querySelector<HTMLTextAreaElement>("textarea:not([placeholder])")!
    const save = () => Array.from(container.querySelectorAll("button")).find(button =>
      ["settings.common.actions.saveChanges", "settings.common.actions.saving"].includes(button.textContent ?? ""))!
    await act(async () => typeInto(editor(), "---\ndescription: Description\n---\nAlpha saved"))
    await act(async () => save().click())
    expect(updateSkill).toHaveBeenCalledTimes(1)
    currentDirectory = "/other"
    getSkillByName.mockReturnValue({ name: "review", path: "/other/review/SKILL.md" })
    getSkillDetail.mockResolvedValue({ sources: { md: { description: "Description", instructions: "Beta" } } })
    render()
    await settle()
    await act(async () => finish(true))
    expect(editor().value).toContain("Beta")
    expect(save().disabled).toBe(true)
  })

})
