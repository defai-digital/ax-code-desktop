import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { generateTheme } from "@/lib/theme/generateTheme"

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
      reloadCustomThemes: vi.fn(async () => []),
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

  test("previews primary text on the actual light and dark button tints", () => {
    renderDialog()
    for (const variant of ["dark", "light"] as const) {
      const modeButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === (variant === "dark" ? "Dark" : "Light"),
      )!
      act(() => modeButton.click())
      const preview = Array.from(container.querySelectorAll("span")).find(
        (span) => span.textContent === "Primary button",
      )!
      const theme = generateTheme({ id: "preview", name: "Preview", variant, base: "#24262d", accent: "#6d75e8" })
      const expected = document.createElement("span")
      expected.style.color = theme.colors.primary.base
      expected.style.backgroundColor = `color-mix(in srgb, ${theme.colors.primary.base} ${variant === "dark" ? 16 : 10}%, ${variant === "dark" ? "transparent" : theme.colors.surface.background})`
      expect(preview.style.color).toBe(expected.style.color)
      expect(preview.style.backgroundColor).toBe(expected.style.backgroundColor)
      expect(preview.style.backgroundColor).toContain("color-mix")
    }
  })

  test("re-saving a name and mode keeps its persistent id while replacing the colors", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    renderDialog()
    act(() => setInputValue(container.querySelector("input")!, "Resaved"))
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save theme",
    )!
    for (const contrast of ["0", "1"]) {
      act(() => setInputValue(slider, contrast))
      await act(async () => saveButton.click())
    }
    const requests = vi.mocked(fetch).mock.calls
    const low = JSON.parse(String(requests[0]?.[1]?.body)).theme
    const high = JSON.parse(String(requests[1]?.[1]?.body)).theme
    expect(high.metadata.id).toBe(low.metadata.id)
    expect(low.colors.surface.background).toBe("#151618")
    expect(high.colors.surface.background).toBe("#09090b")
  })

  test("posts the generated theme, reloads themes, and asks for it to be selected", async () => {
    const onOpenChange = vi.fn()
    const onThemeSaved = vi.fn()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", fetchMock)
    // The selection is armed only for a theme the reloaded list actually holds.
    const reloadCustomThemes = vi.fn(async () => {
      const sent = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as { theme?: { metadata?: unknown } }
      return sent.theme ? [{ metadata: sent.theme.metadata }] : []
    })
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
      id: expect.stringMatching(/^generated-ocean-blue-[0-9a-z]{7}-dark$/),
      name: "Ocean Blue",
      variant: "dark",
    })
    expect(reloadCustomThemes).toHaveBeenCalledOnce()
    expect(onThemeSaved).toHaveBeenCalledWith({
      id: expect.stringMatching(/^generated-ocean-blue-[0-9a-z]{7}-dark$/),
      variant: "dark",
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toastSuccess).toHaveBeenCalledOnce()
  })

  test("does not arm a selection when the reloaded list never holds the theme", async () => {
    // Regression: the pending selection survived a failed reload, so the next
    // successful one silently switched the user's theme.
    const onThemeSaved = vi.fn()
    const reloadCustomThemes = vi.fn(async () => null)
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", fetchMock)
    renderDialog({ reloadCustomThemes, onThemeSaved })

    const nameInput = container.querySelector("input") as HTMLInputElement
    act(() => setInputValue(nameInput, "Ocean Blue"))
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save theme",
    )
    await act(async () => {
      saveButton?.click()
    })

    expect(reloadCustomThemes).toHaveBeenCalledOnce()
    expect(onThemeSaved).not.toHaveBeenCalled()
  })

  test("gives distinct names distinct ids that fit the server rule", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", fetchMock)
    const ids: string[] = []
    for (const name of ["海洋", "テーマ", "x".repeat(80)]) {
      act(() => root.unmount())
      root = createRoot(container)
      renderDialog()
      const nameInput = container.querySelector("input") as HTMLInputElement
      act(() => setInputValue(nameInput, name))
      const saveButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Save theme",
      )
      await act(async () => {
        saveButton?.click()
      })
      const request = fetchMock.mock.calls.at(-1)?.[1]
      ids.push(JSON.parse(String(request?.body)).theme.metadata.id)
    }
    for (const id of ids) expect(id).toMatch(/^generated-[a-z0-9][a-z0-9-]{0,60}$/)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
