import { describe, it, expect } from "vitest"
import { desktopBrowserRuntimeEnv } from "./browser-runtime-policy.js"

describe("Desktop browser launcher policy", () => {
  it("overrides inherited Chrome mode and token without mutating the parent", () => {
    const env = { AX_CODE_BROWSER_MODE: "chrome", AX_CODE_DESKTOP_BROWSER_TOKEN: "inherited", OTHER: "retained" }
    expect(desktopBrowserRuntimeEnv(env, "a".repeat(43))).toEqual({
      ...env,
      AX_CODE_BROWSER_MODE: "embedded",
      AX_CODE_DESKTOP_BROWSER_TOKEN: "a".repeat(43),
    })
    expect(env.AX_CODE_BROWSER_MODE).toBe("chrome")
  })
  it("requires a launcher-owned provider token", () => {
    expect(() => desktopBrowserRuntimeEnv({}, "invalid")).toThrow("launcher-owned")
  })
})
