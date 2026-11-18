import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import type { SkillCatalogConfig } from "@/lib/desktop"
import { AddCatalogDialog } from "./AddCatalogDialog"

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  scan: vi.fn(),
  refresh: vi.fn(),
  loadIdentity: vi.fn(),
}))
vi.mock("./catalogSettings", () => ({ loadCatalogSettings: mocks.load }))
vi.mock("@/lib/persistence", () => ({ updateDesktopSettings: mocks.save }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/stores/useSkillsCatalogStore", () => ({
  useSkillsCatalogStore: (selector: (state: unknown) => unknown) =>
    selector({ scanRepo: mocks.scan, loadCatalog: mocks.refresh, isScanning: false }),
}))
vi.mock("@/stores/useGitIdentitiesStore", () => ({
  useGitIdentitiesStore: (selector: (state: unknown) => unknown) =>
    selector({ defaultGitIdentityId: null, loadDefaultGitIdentityId: mocks.loadIdentity }),
}))
vi.mock("@/components/ui/dialog", () => {
  const Wrapper = (props: { children: React.ReactNode }) => <div>{props.children}</div>
  return {
    Dialog: (props: { open: boolean; children: React.ReactNode }) => (props.open ? <div>{props.children}</div> : null),
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogFooter: Wrapper,
    DialogTitle: Wrapper,
    DialogDescription: Wrapper,
  }
})

const deferred = () => {
  let resolve!: (value: { skillCatalogs: SkillCatalogConfig[] } | null) => void
  const promise = new Promise<{ skillCatalogs: SkillCatalogConfig[] } | null>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
const render = async (open: boolean) =>
  act(async () => {
    root.render(<AddCatalogDialog open={open} onOpenChange={() => {}} />)
  })
const input = (placeholder: string, value: string) => {
  const element = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}
const click = (suffix: string) => {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.endsWith(suffix))!
  expect(button.disabled).toBe(false)
  button.click()
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  mocks.scan.mockResolvedValue({ ok: true, items: [{ name: "example" }] })
  mocks.save.mockResolvedValue(undefined)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

test("a read from a closed dialog cannot replace the reopened dialog's catalogue", async () => {
  const older = deferred(),
    fresh = deferred()
  mocks.load.mockReturnValueOnce(older.promise).mockReturnValueOnce(fresh.promise)
  await render(true)
  await render(false)
  await render(true)
  const retained = { id: "custom:fresh", label: "Fresh", source: "https://example.com/fresh.git" }
  await act(async () => fresh.resolve({ skillCatalogs: [retained] }))
  await act(async () => older.resolve({ skillCatalogs: [{ ...retained, id: "custom:old" }] }))
  act(() => {
    input("settings.skills.catalog.add.field.catalogNamePlaceholder", "New")
    input("settings.skills.catalog.shared.field.repositoryPlaceholder", "https://example.com/new.git")
  })
  await act(async () => click("settings.skills.catalog.shared.actions.scan"))
  await act(async () => click("settings.skills.catalog.add.actions.addCatalog"))
  expect(mocks.save).toHaveBeenCalledWith({ skillCatalogs: [retained, expect.objectContaining({ label: "New" })] })
})

test("a refused read cannot authorize a whole-list write after a successful scan", async () => {
  mocks.load.mockResolvedValue(null)
  await render(true)
  act(() => {
    input("settings.skills.catalog.add.field.catalogNamePlaceholder", "New")
    input("settings.skills.catalog.shared.field.repositoryPlaceholder", "https://example.com/new.git")
  })
  await act(async () => click("settings.skills.catalog.shared.actions.scan"))
  await act(async () => click("settings.skills.catalog.add.actions.addCatalog"))
  expect(mocks.save).not.toHaveBeenCalled()
})
