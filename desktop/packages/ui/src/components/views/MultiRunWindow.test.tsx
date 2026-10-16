import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const { onCancel } = vi.hoisted(() => ({ onCancel: { current: null as null | (() => void) } }))

vi.mock("@/components/multirun", () => ({
  MultiRunLauncher: ({ onCancel: cancel }: { onCancel: () => void }) => {
    onCancel.current = cancel
    return null
  },
}))

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Root: ({ children }: React.PropsWithChildren<{ open?: boolean }>) => <div>{children}</div>,
    Portal: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Backdrop: () => null,
    Popup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Description: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  },
}))

vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))

const { MultiRunWindow } = await import("./MultiRunWindow")

describe("MultiRunWindow close requests", () => {
  let container: HTMLDivElement
  let root: Root
  let onOpenChange: (open: boolean) => void
  let floatingMenu: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onOpenChange = vi.fn()

    floatingMenu = document.createElement("div")
    floatingMenu.setAttribute("data-slot", "dropdown-menu-content")
    floatingMenu.setAttribute("data-open", "")
    onCancel.current = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderWindow = () => {
    act(() => {
      root.render(
        <I18nProvider>
          <MultiRunWindow open onOpenChange={onOpenChange} />
        </I18nProvider>,
      )
    })
  }

  const mountFloatingMenu = () => document.body.appendChild(floatingMenu)

  test("a launcher cancel closes the window when nothing floats above it", () => {
    renderWindow()
    act(() => onCancel.current?.())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test("a launcher cancel is ignored while a floating menu is open", () => {
    renderWindow()
    mountFloatingMenu()
    act(() => onCancel.current?.())
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
