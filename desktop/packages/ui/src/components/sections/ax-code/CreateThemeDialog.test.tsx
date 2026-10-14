import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

type MockDialogProps = React.PropsWithChildren<{ open?: boolean; className?: string }>

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open = true }: MockDialogProps) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: MockDialogProps) => <div>{children}</div>,
  DialogDescription: ({ children }: MockDialogProps) => <p>{children}</p>,
  DialogFooter: ({ children }: MockDialogProps) => <div>{children}</div>,
  DialogHeader: ({ children }: MockDialogProps) => <div>{children}</div>,
  DialogTitle: ({ children }: MockDialogProps) => <h2>{children}</h2>,
}))

const { toastSuccess, toastError } = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }))
vi.mock("@/components/ui", () => ({
  toast: { success: toastSuccess, error: toastError },
}))

const { CreateThemeDialog } = await import("./CreateThemeDialog")

describe("CreateThemeDialog", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderDialog = (props = {}) => {
    const defaults = {
      open: true,
      onOpenChange: vi.fn(),
      reloadCustomThemes: vi.fn(async () => {}),
      onThemeSaved: vi.fn(),
    }
    const merged = { ...defaults, ...props }
    act(() => {
      root.render(
        <I18nProvider>
          <CreateThemeDialog {...merged} />
        </I18nProvider>,
      )
    })
    return merged
  }

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }

  test("renders the live preview and disables save when the name is empty", () => {
    renderDialog()

    expect(container.textContent).toContain("Body text with muted supporting text.")
    expect(container.textContent).toContain("Primary button")
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save theme",
    )
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
  })

  test("posts the generated theme, reloads themes, and asks for it to be selected", async () => {
    const reloadCustomThemes = vi.fn(async () => {})
    const onOpenChange = vi.fn()
    const onThemeSaved = vi.fn()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", fetchMock)
    renderDialog({ reloadCustomThemes, onOpenChange, onThemeSaved })

    const nameInput = container.querySelector("input") as HTMLInputElement
    act(() => setInputValue(nameInput, "Ocean Blue"))
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save theme",
    )
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)

    await act(async () => {
      saveButton?.click()
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0]?.[1]
    const payload = JSON.parse(String(request?.body))
    expect(payload.theme.metadata).toMatchObject({
      id: "generated-ocean-blue-dark",
      name: "Ocean Blue",
      variant: "dark",
    })
    expect(reloadCustomThemes).toHaveBeenCalledOnce()
    expect(onThemeSaved).toHaveBeenCalledWith({ id: "generated-ocean-blue-dark", variant: "dark" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toastSuccess).toHaveBeenCalledOnce()
  })
})
