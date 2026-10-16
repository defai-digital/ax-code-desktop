import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const { WorktreeBranchDisplay } = await import("./WorktreeBranchDisplay")

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView")

describe("WorktreeBranchDisplay rename", () => {
  let container: HTMLDivElement
  let root: Root
  let onRename: ReturnType<typeof vi.fn<(oldName: string, newName: string) => Promise<void>>>

  const render = (currentBranch: string) => {
    act(() =>
      root.render(<WorktreeBranchDisplay currentBranch={currentBranch} onRename={onRename} />),
    )
  }

  const openEditor = () => {
    act(() => {
      container.querySelector<HTMLButtonElement>('[title="gitView.branch.renameTitle"]')?.click()
    })
  }

  const input = () => container.querySelector<HTMLInputElement>("input")!
  const saveButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!

  const type = (value: string) => {
    act(() => {
      const element = input()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      setter?.call(element, value)
      element.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  const save = () =>
    act(() => {
      saveButton().click()
    })

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    onRename = vi.fn(async () => {})
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  test("renames to the sanitized name", async () => {
    render("main")
    openEditor()
    type("feature/rename")
    expect(saveButton().disabled).toBe(false)

    await save()

    expect(onRename).toHaveBeenCalledWith("main", "feature/rename")
  })

  test("offers no save while the name is the branch that already exists", () => {
    // `feature a` sanitizes to the current branch: the field shows `feature-a`, so the save
    // button cannot look like it renamed anything.
    render("feature-a")
    openEditor()
    type("feature a")

    expect(input().value).toBe("feature-a")
    expect(saveButton().disabled).toBe(true)
    expect(onRename).not.toHaveBeenCalled()
  })

  test("offers no save for a name git cannot take", () => {
    render("main")
    openEditor()
    type("---")

    expect(input().value).toBe("")
    expect(saveButton().disabled).toBe(true)

    expect(onRename).not.toHaveBeenCalled()
  })
})
