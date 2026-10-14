import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const {
  attachRendererNavigationGuards,
  createUpdateInstallGate,
  quotePowerShellLiteral,
} = require("./desktop-renderer-guards.js")

describe("quotePowerShellLiteral", () => {
  test("wraps a path in a literal single-quoted string", () => {
    expect(quotePowerShellLiteral("C:\\work\\project")).toBe("'C:\\work\\project'")
  })

  test("stops a directory name from being expanded as a subexpression", () => {
    // In double quotes PowerShell would run this; a literal single-quoted
    // string keeps it as the path text.
    expect(quotePowerShellLiteral("C:\\work\\$(Start-Process calc.exe)")).toBe(
      "'C:\\work\\$(Start-Process calc.exe)'",
    )
  })

  test("doubles embedded single quotes", () => {
    expect(quotePowerShellLiteral("C:\\it's\\project")).toBe("'C:\\it''s\\project'")
  })

  test("handles missing values", () => {
    expect(quotePowerShellLiteral(undefined)).toBe("''")
  })
})

describe("createUpdateInstallGate", () => {
  test("refuses to install before any download completed", () => {
    const gate = createUpdateInstallGate()

    expect(gate.canInstall()).toBe(false)
  })

  test("allows an install once a download completed and reports its version", () => {
    const gate = createUpdateInstallGate()

    gate.onDownloaded({ version: "7.26.0" })

    expect(gate.canInstall()).toBe(true)
    expect(gate.version()).toBe("7.26.0")
  })

  test("refuses again after an error removed the downloaded update", () => {
    // electron-updater clears its cached file on a failed check/install; asking
    // it to quit then leaves the app running with its services already stopped.
    const gate = createUpdateInstallGate()
    gate.onDownloaded({ version: "7.26.0" })

    gate.onNotInstallable()

    expect(gate.canInstall()).toBe(false)
  })
})

describe("attachRendererNavigationGuards", () => {
  const createContents = () => new EventEmitter()

  test("allows trusted navigations and redirects", () => {
    const contents = createContents()
    const onBlocked = vi.fn()
    attachRendererNavigationGuards(contents, { isTrustedUrl: (url) => url.startsWith("app://"), onBlocked })

    const navigation = { preventDefault: vi.fn() }
    contents.emit("will-navigate", navigation, "app://ax-code/index.html")
    contents.emit("will-redirect", navigation, "app://ax-code/index.html")

    expect(navigation.preventDefault).not.toHaveBeenCalled()
    expect(onBlocked).not.toHaveBeenCalled()
  })

  test("blocks a remote redirect as well as a remote navigation", () => {
    const contents = createContents()
    const onBlocked = vi.fn()
    attachRendererNavigationGuards(contents, { isTrustedUrl: (url) => url.startsWith("app://"), onBlocked })

    const navigation = { preventDefault: vi.fn() }
    contents.emit("will-navigate", navigation, "https://example.com/")
    expect(navigation.preventDefault).toHaveBeenCalledTimes(1)

    // The redirect path used to be unguarded: the main frame keeps its preload
    // bridge, so a remote page would keep window-chrome IPC access.
    contents.emit("will-redirect", navigation, "https://example.com/")
    expect(navigation.preventDefault).toHaveBeenCalledTimes(2)
    expect(onBlocked).toHaveBeenNthCalledWith(1, "https://example.com/")
    expect(onBlocked).toHaveBeenNthCalledWith(2, "https://example.com/")
  })

  test("ignores contents without an event API", () => {
    expect(() => attachRendererNavigationGuards(null, {})).not.toThrow()
  })
})
