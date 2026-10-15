import { describe, expect, test } from "vitest"

import { resolveBesideChatRedirect } from "./besideChat"

describe("resolveBesideChatRedirect", () => {
  test("redirects every non-chat tab on desktop", () => {
    expect(resolveBesideChatRedirect("diff", false)).toBe("diff")
    expect(resolveBesideChatRedirect("files", false)).toBe("files")
    expect(resolveBesideChatRedirect("git", false)).toBe("git")
    expect(resolveBesideChatRedirect("plan", false)).toBe("plan")
    expect(resolveBesideChatRedirect("context", false)).toBe("context")
    expect(resolveBesideChatRedirect("terminal", false)).toBe("terminal")
  })

  test("never redirects chat itself", () => {
    expect(resolveBesideChatRedirect("chat", false)).toBeNull()
    expect(resolveBesideChatRedirect("chat", true)).toBeNull()
  })

  test("never redirects on mobile, where the full-cover view is used", () => {
    expect(resolveBesideChatRedirect("diff", true)).toBeNull()
    expect(resolveBesideChatRedirect("terminal", true)).toBeNull()
  })
})
