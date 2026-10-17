import { describe, expect, it } from "vitest"

import {
  deriveHooksFileStatus,
  deriveHooksTrustNotice,
  hookCommandNeedsExpansion,
  hookMatcherLabel,
  hookSourceLabel,
  hooksLoadErrorMessage,
} from "./hooksModel"

const file = (overrides: Partial<{ path: string; exists: boolean; valid: boolean; error?: string }> = {}) => ({
  path: "/repo/.ax-code/hooks.json",
  exists: true,
  valid: true,
  ...overrides,
})

describe("deriveHooksFileStatus", () => {
  it("reports a missing file even when valid is set", () => {
    expect(deriveHooksFileStatus(file({ exists: false, valid: true }))).toBe("missing")
  })

  it("reports a valid file that exists", () => {
    expect(deriveHooksFileStatus(file({ exists: true, valid: true }))).toBe("valid")
  })

  it("reports an existing file that failed to parse", () => {
    expect(deriveHooksFileStatus(file({ exists: true, valid: false, error: "expected array" }))).toBe("invalid")
  })
})

describe("deriveHooksTrustNotice", () => {
  it("warns when an existing file is not trusted", () => {
    expect(deriveHooksTrustNotice({ trusted: false, file: file({ exists: true }) })).toBe("ignored")
  })

  it("stays neutral when there is no file to trust", () => {
    expect(deriveHooksTrustNotice({ trusted: false, file: file({ exists: false }) })).toBe("absent")
  })

  it("hides the notice once the runtime trusts project hooks", () => {
    expect(deriveHooksTrustNotice({ trusted: true, file: file({ exists: true, valid: false }) })).toBeNull()
    expect(deriveHooksTrustNotice({ trusted: true, file: file({ exists: false }) })).toBeNull()
  })
})

describe("hook labels", () => {
  it("treats a blank matcher as every tool", () => {
    expect(hookMatcherLabel(undefined)).toEqual({ kind: "all" })
    expect(hookMatcherLabel("  ")).toEqual({ kind: "all" })
    expect(hookMatcherLabel(" Bash ")).toEqual({ kind: "matcher", value: "Bash" })
  })

  it("labels project hooks and pack hooks separately", () => {
    expect(hookSourceLabel({ source: "project", pack: "ignored" })).toEqual({ kind: "project" })
    expect(hookSourceLabel({ source: "pack", pack: " format " })).toEqual({ kind: "pack", name: "format" })
    expect(hookSourceLabel({ source: "pack" })).toEqual({ kind: "pack", name: "" })
  })

  it("asks for expansion when a command is long or multiline", () => {
    expect(hookCommandNeedsExpansion("echo ok")).toBe(false)
    expect(hookCommandNeedsExpansion("x".repeat(96))).toBe(false)
    expect(hookCommandNeedsExpansion("x".repeat(97))).toBe(true)
    expect(hookCommandNeedsExpansion("echo\ndone")).toBe(true)
  })
})

describe("hooksLoadErrorMessage", () => {
  it("reads an error message and ignores empty values", () => {
    expect(hooksLoadErrorMessage(new Error(" network down "))).toBe("network down")
    expect(hooksLoadErrorMessage("  offline  ")).toBe("offline")
    expect(hooksLoadErrorMessage(new Error("   "))).toBe("")
    expect(hooksLoadErrorMessage({ message: "nope" })).toBe("")
  })
})
