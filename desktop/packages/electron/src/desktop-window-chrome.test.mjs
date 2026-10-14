import { EventEmitter } from "node:events"
import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const {
  DEFAULT_BACKGROUND_DARK,
  DEFAULT_BACKGROUND_LIGHT,
  attachTrafficLightRefresh,
  macosMajorFromDarwinRelease,
  nativeWindowChromeOptions,
  normalizeHexColor,
  resolveWindowBackgroundColor,
} = require("./desktop-window-chrome.js")

describe("macOS major version", () => {
  test("maps Darwin releases across the macOS 26 renumbering", () => {
    expect(macosMajorFromDarwinRelease("20.6.0")).toBe(11)
    expect(macosMajorFromDarwinRelease("24.6.0")).toBe(15)
    expect(macosMajorFromDarwinRelease("25.0.0")).toBe(26)
    expect(macosMajorFromDarwinRelease("26.1.0")).toBe(27)
  })

  test("returns 0 for unknown or pre-Big Sur releases", () => {
    expect(macosMajorFromDarwinRelease("19.6.0")).toBe(0)
    expect(macosMajorFromDarwinRelease("")).toBe(0)
    expect(macosMajorFromDarwinRelease(undefined)).toBe(0)
  })
})

describe("native window chrome options", () => {
  test("hides the macOS title bar and centres the lights in the renderer header", () => {
    expect(nativeWindowChromeOptions({ platform: "darwin", macosMajor: 26 })).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 14, y: 15 },
    })
    expect(nativeWindowChromeOptions({ platform: "darwin", macosMajor: 15 })).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 16, y: 21 },
    })
  })

  test("keeps the native frame on Windows and Linux", () => {
    expect(nativeWindowChromeOptions({ platform: "win32", macosMajor: 0 })).toEqual({})
    expect(nativeWindowChromeOptions({ platform: "linux", macosMajor: 0 })).toEqual({})
  })
})

describe("window background colour", () => {
  test("follows the system appearance unless a fixed variant is chosen", () => {
    const settings = { splashBgDark: "#101010", splashBgLight: "#FAFAFA" }
    expect(resolveWindowBackgroundColor(settings, true)).toBe("#101010")
    expect(resolveWindowBackgroundColor(settings, false)).toBe("#FAFAFA")
    expect(resolveWindowBackgroundColor({ ...settings, useSystemTheme: false, themeVariant: "light" }, true)).toBe(
      "#FAFAFA",
    )
    expect(resolveWindowBackgroundColor({ ...settings, useSystemTheme: false, themeVariant: "dark" }, false)).toBe(
      "#101010",
    )
  })

  test("falls back to the default theme canvas for missing or unsafe colours", () => {
    expect(resolveWindowBackgroundColor({}, true)).toBe(DEFAULT_BACKGROUND_DARK)
    expect(resolveWindowBackgroundColor(null, false)).toBe(DEFAULT_BACKGROUND_LIGHT)
    expect(resolveWindowBackgroundColor({ splashBgDark: "red; background: url(x)" }, true)).toBe(
      DEFAULT_BACKGROUND_DARK,
    )
    expect(resolveWindowBackgroundColor({ splashBgLight: "#FFFA" }, false)).toBe(DEFAULT_BACKGROUND_LIGHT)
  })

  test("normalizes opaque hex colours and rejects everything else", () => {
    expect(normalizeHexColor(" #0a0A0a ")).toBe("#0a0A0a")
    expect(normalizeHexColor("#FFF")).toBe("#FFFFFF")
    expect(resolveWindowBackgroundColor({ splashBgLight: "#FFF" }, false)).toBe("#FFFFFF")
    expect(normalizeHexColor("#0A0A0A80")).toBeNull()
    expect(normalizeHexColor("oklch(0.2 0 0)")).toBeNull()
    expect(normalizeHexColor(12)).toBeNull()
  })
})

describe("traffic light refresh", () => {
  const createWindow = () => {
    let fullscreen = false
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isFullScreen: () => fullscreen,
      setWindowButtonVisibility: vi.fn(),
      setWindowButtonPosition: vi.fn(),
    })
    return { window, setFullscreen: (value) => (fullscreen = value) }
  }

  test("re-asserts the button position after restore and fullscreen exit", () => {
    vi.useFakeTimers()
    const { window } = createWindow()
    attachTrafficLightRefresh(window, { x: 14, y: 15 })

    window.emit("restore")
    expect(window.setWindowButtonPosition).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(window.setWindowButtonPosition).toHaveBeenCalledTimes(2)
    window.emit("leave-full-screen")
    vi.advanceTimersByTime(250)
    expect(window.setWindowButtonPosition).toHaveBeenCalledTimes(4)
    expect(window.setWindowButtonPosition).toHaveBeenLastCalledWith({ x: 14, y: 15 })
    expect(window.setWindowButtonVisibility).toHaveBeenCalledWith(true)
    vi.useRealTimers()
  })

  test("leaves the hidden fullscreen buttons alone", () => {
    const { window, setFullscreen } = createWindow()
    attachTrafficLightRefresh(window, { x: 14, y: 15 })
    setFullscreen(true)

    window.emit("focus")
    window.emit("show")
    expect(window.setWindowButtonVisibility).not.toHaveBeenCalled()
    expect(window.setWindowButtonPosition).not.toHaveBeenCalled()
  })
})
