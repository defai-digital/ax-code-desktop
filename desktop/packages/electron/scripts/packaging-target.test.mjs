import { describe, it, expect } from "vitest"
import { assertSupportedWindowsTarget } from "./packaging-target.mjs"

describe("Windows packaging support", () => {
  it("rejects Windows ARM64 before staging or packaging", () => {
    expect(() => assertSupportedWindowsTarget(["--win", "--arm64"])).toThrow("Windows x64 only")
    expect(() => assertSupportedWindowsTarget(["--win=nsis", "--arm64"])).toThrow("Windows x64 only")
    expect(() => assertSupportedWindowsTarget([], { platform: "win32", arch: "arm64" })).toThrow("Windows x64 only")
    expect(() => assertSupportedWindowsTarget(["--win", "--ia32"])).toThrow("Windows x64 only")
  })
  it("retains Windows x64 and Unix ARM64 packages", () => {
    for (const args of [
      ["--win", "--x64"],
      ["--mac", "--arm64"],
      ["--linux", "--arm64"],
    ]) {
      expect(() => assertSupportedWindowsTarget(args)).not.toThrow()
    }
  })
})
