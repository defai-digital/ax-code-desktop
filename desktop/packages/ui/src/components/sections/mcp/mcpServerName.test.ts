import { describe, expect, test } from "vitest"
import { normalizeMcpServerName } from "./mcpServerName"

describe("normalizeMcpServerName", () => {
  test("applies the server's rule to a name that skipped the typing rule", () => {
    expect(normalizeMcpServerName("Roblox_Studio")).toBe("roblox_studio")
    expect(normalizeMcpServerName("My Server")).toBe("my-server")
    expect(normalizeMcpServerName("  spaced out  ")).toBe("spaced-out")
  })

  test("drops separators the server rejects at either end", () => {
    expect(normalizeMcpServerName("-leading")).toBe("leading")
    expect(normalizeMcpServerName("trailing_")).toBe("trailing")
    expect(normalizeMcpServerName("--")).toBe("")
  })

  test("leaves an already valid name alone", () => {
    expect(normalizeMcpServerName("github")).toBe("github")
    expect(normalizeMcpServerName("my_server-2")).toBe("my_server-2")
  })
})
