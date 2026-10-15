import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const {
  QUICK_DISPATCH_ACCELERATOR,
  readQuickDispatchShortcutEnabled,
  syncQuickDispatchShortcut,
} = require("./quick-dispatch-shortcut.js")

describe("quick dispatch global shortcut", () => {
  test("accelerator is Alt+Space", () => {
    expect(QUICK_DISPATCH_ACCELERATOR).toBe("Alt+Space")
  })

  test("reads only a boolean true", () => {
    expect(readQuickDispatchShortcutEnabled(null)).toBe(false)
    expect(readQuickDispatchShortcutEnabled(undefined)).toBe(false)
    expect(readQuickDispatchShortcutEnabled([])).toBe(false)
    expect(readQuickDispatchShortcutEnabled({})).toBe(false)
    expect(readQuickDispatchShortcutEnabled({ quickDispatchGlobalShortcut: false })).toBe(false)
    expect(readQuickDispatchShortcutEnabled({ quickDispatchGlobalShortcut: "true" })).toBe(false)
    expect(readQuickDispatchShortcutEnabled({ quickDispatchGlobalShortcut: 1 })).toBe(false)
    expect(readQuickDispatchShortcutEnabled({ quickDispatchGlobalShortcut: true })).toBe(true)
  })

  test("does nothing when disabled and not registered", () => {
    const register = vi.fn()
    const unregister = vi.fn()
    expect(syncQuickDispatchShortcut({ enabled: false, registered: false, register, unregister })).toBe(false)
    expect(register).not.toHaveBeenCalled()
    expect(unregister).not.toHaveBeenCalled()
  })

  test("unregisters when disabled", () => {
    const unregister = vi.fn()
    expect(
      syncQuickDispatchShortcut({
        enabled: false,
        registered: true,
        register: vi.fn(),
        unregister,
      }),
    ).toBe(false)
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  test("treats a thrown unregister as released", () => {
    expect(
      syncQuickDispatchShortcut({
        enabled: false,
        registered: true,
        register: vi.fn(),
        unregister: () => {
          throw new Error("already gone")
        },
      }),
    ).toBe(false)
  })

  test("registers once while enabled", () => {
    const register = vi.fn(() => true)
    expect(syncQuickDispatchShortcut({ enabled: true, registered: false, register, unregister: vi.fn() })).toBe(true)
    expect(register).toHaveBeenCalledTimes(1)

    register.mockClear()
    expect(syncQuickDispatchShortcut({ enabled: true, registered: true, register, unregister: vi.fn() })).toBe(true)
    expect(register).not.toHaveBeenCalled()
  })

  test("stays unregistered when the OS rejects or throws", () => {
    expect(
      syncQuickDispatchShortcut({
        enabled: true,
        registered: false,
        register: () => false,
        unregister: vi.fn(),
      }),
    ).toBe(false)
    expect(
      syncQuickDispatchShortcut({
        enabled: true,
        registered: false,
        register: () => {
          throw new Error("reserved")
        },
        unregister: vi.fn(),
      }),
    ).toBe(false)
  })
})
