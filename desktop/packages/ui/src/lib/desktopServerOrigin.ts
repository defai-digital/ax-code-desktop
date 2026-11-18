export const resolveDesktopServerOrigin = (): string => {
  if (typeof window === "undefined") {
    return ""
  }
  const desktopOrigin = window.__AX_CODE_DESKTOP_DESKTOP_SERVER__?.origin
  if (desktopOrigin) {
    return desktopOrigin
  }
  return window.location.origin
}
