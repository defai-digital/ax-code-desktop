import { expect, test, vi } from "vitest"
import { buildEmbeddedSessionChatURL, syncEmbeddedTheme, syncEmbeddedVisibility } from "./embeddedSession"
test("shared iframe URL carries Windows directory and escapes session identifiers", () => {
  const url = new URL(buildEmbeddedSessionChatURL("session & ?", "c:\\work\\repo\\", true))
  expect(url.searchParams.get("directory")).toBe("C:/work/repo")
  expect(url.searchParams.get("sessionId")).toBe("session & ?")
  expect(url.searchParams.get("readOnly")).toBe("1")
  expect(new URL(buildEmbeddedSessionChatURL("a", null)).searchParams.has("readOnly")).toBe(false)
})
test("shared sync uses direct callbacks then origin-bound messages during navigation", () => {
  const direct = vi.fn()
  const postMessage = vi.fn()
  const target = { __openchamberApplyThemeSync: direct, postMessage }
  const frame = { contentWindow: target } as unknown as HTMLIFrameElement
  syncEmbeddedTheme(frame, { themeMode: "dark" })
  expect(direct).toHaveBeenCalledWith({ themeMode: "dark" })
  expect(postMessage).not.toHaveBeenCalled()
  Object.defineProperty(target, "__openchamberApplyThemeSync", {
    get: () => {
      throw new DOMException("Navigation", "SecurityError")
    },
  })
  syncEmbeddedTheme(frame, { themeMode: "light" })
  expect(postMessage).toHaveBeenCalledWith(
    { type: "openchamber:theme-sync", payload: { themeMode: "light" } },
    window.location.origin,
  )
  syncEmbeddedVisibility(frame, false)
  expect(postMessage).toHaveBeenCalledWith(
    { type: "openchamber:embedded-visibility", payload: { visible: false } },
    window.location.origin,
  )
})
