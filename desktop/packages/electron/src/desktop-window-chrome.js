"use strict"

// Native window chrome policy shared by every BrowserWindow the shell opens.
//
// On macOS the renderer draws its own header (Header.tsx, MiniChatLayout.tsx)
// with a drag region and a left inset reserved for the traffic lights, so the
// native title bar is hidden and the lights are positioned inside that header.
// `hiddenInset` is deliberately not used: Electron adds its own extra inset and
// the controls end up visibly lower than the app header.

const DEFAULT_BACKGROUND_DARK = "#0A0A0A"
const DEFAULT_BACKGROUND_LIGHT = "#F7F7F7"
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const SHORT_HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3}$/

// Darwin 20-24 are macOS 11-15; Apple then jumped to the year-based macOS 26
// for Darwin 25. `os.release()` reads uname, so it is not subject to the SDK
// version compatibility shim that reports 10.16/16.0 to older binaries.
const macosMajorFromDarwinRelease = (release) => {
  const darwinMajor = Number.parseInt(String(release ?? "").split(".")[0] ?? "", 10)
  if (!Number.isFinite(darwinMajor) || darwinMajor < 20) return 0
  return darwinMajor >= 25 ? darwinMajor + 1 : darwinMajor - 9
}

// macOS 26+ centres its window controls in a 44px bar and older releases in a
// 56px bar; the renderer header uses the same heights. `trafficLightPosition`
// is the top-left of the ~14px button group, so y centres the group:
// 15 + 14/2 = 22 = 44/2 and 21 + 14/2 = 28 = 56/2.
const macTrafficLightPosition = (macosMajor) => (macosMajor >= 26 ? { x: 14, y: 15 } : { x: 16, y: 21 })

const nativeWindowChromeOptions = ({ platform, macosMajor }) => {
  if (platform !== "darwin") return {}
  return {
    titleBarStyle: "hidden",
    trafficLightPosition: macTrafficLightPosition(macosMajor),
  }
}

// Returns an opaque #RRGGBB colour for Electron, expanding #RGB, or null for
// anything else (alpha forms, CSS functions, injected strings).
const normalizeHexColor = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed
  if (SHORT_HEX_COLOR_PATTERN.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split("")
      .map((digit) => digit + digit)
      .join("")}`
  }
  return null
}

const pickColor = (value, fallback) => normalizeHexColor(value) ?? fallback

// The renderer persists the active theme's canvas colours (splashBgLight/Dark)
// and its theme mode into settings.json. Use them so the first native paint
// matches the theme instead of flashing a fixed colour.
const resolveWindowBackgroundColor = (settings, prefersDarkColors) => {
  const root = settings && typeof settings === "object" ? settings : {}
  const isDark =
    root.useSystemTheme === false && (root.themeVariant === "light" || root.themeVariant === "dark")
      ? root.themeVariant === "dark"
      : Boolean(prefersDarkColors)
  return isDark
    ? pickColor(root.splashBgDark, DEFAULT_BACKGROUND_DARK)
    : pickColor(root.splashBgLight, DEFAULT_BACKGROUND_LIGHT)
}

// AppKit resets the traffic lights in a few transient states (the minimize
// snapshot used by the Dock restore animation, fullscreen exit), so the custom
// position is re-asserted whenever the window comes back, again after the
// restore and fullscreen-exit animations finish. Nothing is re-asserted while
// fullscreen: the lights are hidden there and the renderer drops their inset.
const attachTrafficLightRefresh = (browserWindow, position) => {
  if (!browserWindow || typeof browserWindow.setWindowButtonPosition !== "function") return
  const refresh = () => {
    if (browserWindow.isDestroyed() || browserWindow.isFullScreen()) return
    try {
      browserWindow.setWindowButtonVisibility(true)
      browserWindow.setWindowButtonPosition(position)
    } catch {}
  }
  const refreshAfterAnimation = () => {
    refresh()
    setTimeout(refresh, 250)
  }
  browserWindow.on("minimize", refresh)
  browserWindow.on("restore", refreshAfterAnimation)
  browserWindow.on("show", refresh)
  browserWindow.on("focus", refresh)
  browserWindow.on("leave-full-screen", refreshAfterAnimation)
}

module.exports = {
  DEFAULT_BACKGROUND_DARK,
  DEFAULT_BACKGROUND_LIGHT,
  attachTrafficLightRefresh,
  macTrafficLightPosition,
  macosMajorFromDarwinRelease,
  nativeWindowChromeOptions,
  normalizeHexColor,
  resolveWindowBackgroundColor,
}
