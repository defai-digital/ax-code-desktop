import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import {
  deferMenuDialogOpen,
  MENU_DIALOG_DISMISSAL_GRACE_MS,
  useCancelTransientMenuFocusOut,
} from "@/lib/menuDialogFocus"
import { createMenuDialogRequest, type MenuDialogRequest } from "@/lib/menuDialogRequest"
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
const title = () => document.querySelector('[data-slot="dialog-title"]')

describe("menu dismissal of a just-opened dialog", () => {
  let root: Root
  let container: HTMLDivElement
  let setOpen: (open: boolean) => void
  let openFromMenu: () => void
  let contentReady: boolean
  let nowMs: number
  let renderDelayMs: number

  const RenderWork = () => {
    // Model expensive child rendering after Dialog's own render, before commit.
    nowMs += renderDelayMs
    renderDelayMs = 0
    return null
  }
  const Probe = () => {
    const [state, set] = React.useState<{ open: boolean; request?: MenuDialogRequest }>({ open: false })
    setOpen = (open) => set({ open })
    openFromMenu = () => set({ open: true, request: createMenuDialogRequest() })
    return (
      <I18nProvider>
        <Dialog menuRequest={state.request} open={state.open} onOpenChange={setOpen}>
          {contentReady && (
            <DialogContent>
              <RenderWork />
              <DialogTitle>AX Code</DialogTitle>
            </DialogContent>
          )}
        </Dialog>
      </I18nProvider>
    )
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    nowMs = 1_000
    renderDelayMs = 0
    contentReady = true
    // Control the policy clock while leaving DOM/event timers real.
    vi.spyOn(Date, "now").mockImplementation(() => nowMs)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const openState = async (fromMenu = false, queuedDelayMs = 0) => {
    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      if (fromMenu) {
        await new Promise<void>((resolve) => {
          deferMenuDialogOpen(() => {
            openFromMenu()
            resolve()
          })
          nowMs += queuedDelayMs
        })
      } else setOpen(true)
    })
    await act(async () => {})
  }
  const currentBackdrop = () => {
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]')
    if (!title() || !backdrop) throw new Error("dialog did not open")
    return backdrop
  }
  const renderOpen = async (fromMenu = false, queuedDelayMs = 0) => {
    await openState(fromMenu, queuedDelayMs)
    return currentBackdrop()
  }
  const press = async (backdrop: Element) => {
    await act(async () => {
      pressBackdrop(backdrop)
    })
  }

  test("an immediate menu backdrop event leaves the dialog open", async () => {
    await press(await renderOpen(true))
    expect(title()?.textContent).toBe("AX Code")
  })
  test("a delayed menu callback still protects the opening backdrop event", async () => {
    await press(await renderOpen(true, MENU_DIALOG_DISMISSAL_GRACE_MS * 2))
    expect(title()?.textContent).toBe("AX Code")
  })
  test("slow child rendering does not consume the committed dialog's grace period", async () => {
    renderDelayMs = MENU_DIALOG_DISMISSAL_GRACE_MS + 100
    await press(await renderOpen(true))
    expect(title()?.textContent).toBe("AX Code")
  })
  test("a repeated menu action renews its own visible request", async () => {
    await renderOpen(true)
    nowMs += MENU_DIALOG_DISMISSAL_GRACE_MS * 2
    await act(async () => {
      await new Promise<void>((resolve) => {
        deferMenuDialogOpen(() => {
          openFromMenu()
          resolve()
        })
      })
    })
    await press(currentBackdrop())
    expect(title()?.textContent).toBe("AX Code")
  })
  test("remounting popup content does not renew an expired request", async () => {
    await renderOpen(true)
    nowMs += MENU_DIALOG_DISMISSAL_GRACE_MS * 2
    contentReady = false
    await act(async () => {
      root.render(<Probe />)
    })
    contentReady = true
    await act(async () => {
      root.render(<Probe />)
    })
    await press(currentBackdrop())
    expect(title()).toBeNull()
  })
  test("a menu request is bounded before its popup commits", async () => {
    const request = createMenuDialogRequest()
    const changed = vi.fn()
    let dismiss!: (open: boolean, details: { reason: string; cancel: () => void }) => void
    const Pending = () => {
      dismiss = useCancelTransientMenuFocusOut(true, (next) => changed(next), request)
      return null
    }
    await act(async () => {
      root.render(<Pending />)
    })
    const earlyCancel = vi.fn()
    await act(async () => {
      dismiss(false, { reason: "focus-out", cancel: earlyCancel })
    })
    expect(earlyCancel).toHaveBeenCalledOnce()
    expect(changed).not.toHaveBeenCalled()
    nowMs += MENU_DIALOG_DISMISSAL_GRACE_MS
    const expiredCancel = vi.fn()
    await act(async () => {
      dismiss(false, { reason: "focus-out", cancel: expiredCancel })
    })
    expect(expiredCancel).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledExactlyOnceWith(false)
  })
  test("the backdrop closes the dialog at the exact grace-period boundary", async () => {
    const backdrop = await renderOpen(true)
    nowMs += MENU_DIALOG_DISMISSAL_GRACE_MS
    await press(backdrop)
    expect(title()).toBeNull()
  })
  test("an ordinary dialog closes on the same backdrop event", async () => {
    await press(await renderOpen())
    expect(title()).toBeNull()
  })
  test("a completed menu opening cannot guard a later ordinary opening", async () => {
    await renderOpen(true)
    await act(async () => {
      setOpen(false)
    })
    expect(title()).toBeNull()
    await press(await renderOpen())
    expect(title()).toBeNull()
  })
  test("lazy popup content gets its grace period when it actually commits", async () => {
    contentReady = false
    await openState(true)
    expect(title()).toBeNull()
    nowMs += MENU_DIALOG_DISMISSAL_GRACE_MS * 2
    contentReady = true
    await act(async () => {
      root.render(<Probe />)
    })
    await press(currentBackdrop())
    expect(title()?.textContent).toBe("AX Code")
  })
  test("a cancelled menu opening cannot guard a later ordinary opening", async () => {
    const open = vi.fn()
    window.clearTimeout(deferMenuDialogOpen(open))
    await press(await renderOpen())
    expect(open).not.toHaveBeenCalled()
    expect(title()).toBeNull()
  })
  test("a menu callback that opens nothing cannot guard a later ordinary opening", async () => {
    await act(async () => {
      await new Promise<void>((resolve) => {
        deferMenuDialogOpen(resolve)
      })
    })
    await press(await renderOpen())
    expect(title()).toBeNull()
  })
  test("the close button still closes a just-opened menu dialog", async () => {
    await renderOpen(true)
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')?.click()
    })
    expect(title()).toBeNull()
  })
  test("Escape still closes a just-opened menu dialog", async () => {
    await renderOpen(true)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    })
    expect(title()).toBeNull()
  })
})
