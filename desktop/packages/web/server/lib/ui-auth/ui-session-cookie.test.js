import { describe, expect, it } from "vitest"
import { resolveUiSessionCookieName } from "./ui-session-cookie.js"

const request = (headers) => ({ headers })

describe("resolveUiSessionCookieName", () => {
  it("keys the cookie by the port the request arrived on", () => {
    // Browsers key cookies by host, not port, so two instances on one host shared one cookie:
    // whichever logged in last logged the other out.
    expect(resolveUiSessionCookieName(request({ host: "192.168.0.1:3000" }))).toBe("oc_ui_session_3000")
    expect(resolveUiSessionCookieName(request({ host: "192.168.0.1:3001" }))).toBe("oc_ui_session_3001")
    expect(resolveUiSessionCookieName(request({ host: "127.0.0.1:4096" }))).toBe("oc_ui_session_4096")
  })

  it("keeps the bare name for a host without a port", () => {
    expect(resolveUiSessionCookieName(request({ host: "desktop.example.com" }))).toBe("oc_ui_session")
    expect(resolveUiSessionCookieName(request({}))).toBe("oc_ui_session")
  })

  it("prefers the forwarded host, which is the origin the browser used", () => {
    expect(resolveUiSessionCookieName(request({ host: "127.0.0.1:4096", "x-forwarded-host": "box:8443" }))).toBe(
      "oc_ui_session_8443",
    )
    expect(resolveUiSessionCookieName(request({ "x-forwarded-host": "desktop.example.com" }))).toBe("oc_ui_session")
  })

  it("reads the port off an IPv6 literal without mistaking its colons for one", () => {
    expect(resolveUiSessionCookieName(request({ host: "[::1]:3000" }))).toBe("oc_ui_session_3000")
    expect(resolveUiSessionCookieName(request({ host: "[::1]" }))).toBe("oc_ui_session")
  })

  it("honours a caller's own base name", () => {
    expect(resolveUiSessionCookieName(request({ host: "127.0.0.1:3000" }), "custom")).toBe("custom_3000")
  })
})
