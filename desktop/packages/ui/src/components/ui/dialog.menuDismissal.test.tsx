import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { armMenuDialogDismissalGuard, resetMenuDialogDismissalGuard } from "@/lib/menuDialogFocus"

import { Dialog, DialogContent, DialogTitle } from "./dialog"

const pressBackdrop = (backdrop: Element) => {
  backdrop.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    }),
  )
  backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }))
}

describe("menu dismissal of a just-opened dialog", () => {
  let root: Root
  let container: HTMLDivElement
  let setOpen: (open: boolean) => void

  const Probe = () => {
    const [open, set] = React.useState(false)
    setOpen = set
    return (
      <I18nProvider>
        <Dialog open={open} onOpenChange={set}>
          <DialogContent>
            <DialogTitle>AX Code</DialogTitle>
          </DialogContent>
        </Dialog>
      </I18nProvider>
    )
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    resetMenuDialogDismissalGuard()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    resetMenuDialogDismissalGuard()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const renderOpen = async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      setOpen(true)
    })
    await act(async () => {})
    const title = document.querySelector('[data-slot="dialog-title"]')
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]')
    if (!title || !backdrop) {
      throw new Error("dialog did not open")
    }
    return { title, backdrop }
  }

  test("a backdrop press just after a menu open leaves the dialog open", async () => {
    armMenuDialogDismissalGuard()
    const { backdrop } = await renderOpen()

    await act(async () => {
      pressBackdrop(backdrop)
    })

    expect(document.querySelector('[data-slot="dialog-title"]')?.textContent).toBe("AX Code")
  })

  test("the same backdrop press closes a dialog that was not opened from the menu", async () => {
    const { backdrop } = await renderOpen()

    await act(async () => {
      pressBackdrop(backdrop)
    })

    expect(document.querySelector('[data-slot="dialog-title"]')).toBeNull()
  })

  test("Escape still closes a dialog that was opened from the menu", async () => {
    armMenuDialogDismissalGuard()
    await renderOpen()

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })

    expect(document.querySelector('[data-slot="dialog-title"]')).toBeNull()
  })
})
