import { describe, expect, test, vi } from "vitest"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createMenuCopyAction } = require("./menu-copy-action.js")

const contents = () => ({ copy: vi.fn(), isDestroyed: () => false })

const setup = ({ focusedWindow, focusedContents, menuTarget = focusedWindow }) => {
  const dispatchAction = vi.fn()
  const copy = createMenuCopyAction({
    getFocusedWindow: () => focusedWindow,
    getFocusedWebContents: () => focusedContents,
    getMenuTargetWindow: () => menuTarget,
    dispatchAction,
  })
  return { copy, dispatchAction }
}

describe("menu copy action", () => {
  test("copies from a focused embedded browser guest, not the app renderer", () => {
    const window = { webContents: contents() }
    const guest = contents()
    const { copy, dispatchAction } = setup({ focusedWindow: window, focusedContents: guest })
    copy()
    expect(guest.copy).toHaveBeenCalledOnce()
    expect(window.webContents.copy).not.toHaveBeenCalled()
    // The renderer's own copy handler would overwrite the guest selection with a stale one.
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  test("copies from the main window renderer and runs its copy handler", () => {
    const window = { webContents: contents() }
    const { copy, dispatchAction } = setup({ focusedWindow: window, focusedContents: window.webContents })
    copy()
    expect(window.webContents.copy).toHaveBeenCalledOnce()
    expect(dispatchAction).toHaveBeenCalledWith("copy")
  })

  test("does not dispatch to the main window when another window has focus", () => {
    const miniChat = { webContents: contents() }
    const main = { webContents: contents() }
    const { copy, dispatchAction } = setup({
      focusedWindow: miniChat,
      focusedContents: miniChat.webContents,
      menuTarget: main,
    })
    copy()
    expect(miniChat.webContents.copy).toHaveBeenCalledOnce()
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  test("falls back to the window contents and does nothing without a focused window", () => {
    const window = { webContents: contents() }
    const destroyed = { copy: vi.fn(), isDestroyed: () => true }
    setup({ focusedWindow: window, focusedContents: destroyed }).copy()
    expect(window.webContents.copy).toHaveBeenCalledOnce()
    expect(destroyed.copy).not.toHaveBeenCalled()

    const { copy, dispatchAction } = setup({ focusedWindow: null, focusedContents: null, menuTarget: window })
    copy()
    expect(dispatchAction).not.toHaveBeenCalled()
  })
})
