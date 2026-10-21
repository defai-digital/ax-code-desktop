import { describe, expect, test } from "vitest"
import { getPermissionToolPresentation } from "./PermissionCardTools"

describe("getPermissionToolPresentation", () => {
  test("groups permission aliases by display name and icon", () => {
    expect(getPermissionToolPresentation("multiedit")).toEqual({ displayName: "edit", icon: "pencil-ai" })
    expect(getPermissionToolPresentation("file_write")).toEqual({ displayName: "write", icon: "file-edit" })
    expect(getPermissionToolPresentation("shell_command")).toEqual({ displayName: "bash", icon: "terminal-box" })
    expect(getPermissionToolPresentation("curl")).toEqual({ displayName: "webfetch", icon: "global" })
  })

  test("presents native WebMCP requests as browser tools", () => {
    expect(getPermissionToolPresentation("webmcp")).toEqual({ displayName: "webmcp", icon: "global" })
    expect(getPermissionToolPresentation("desktop_webmcp")).toEqual({ displayName: "webmcp", icon: "global" })
    expect(getPermissionToolPresentation("webmcp", { toolName: "search-flights", operation: "invoke" })).toEqual({
      displayName: "search-flights",
      icon: "global",
    })
    expect(getPermissionToolPresentation("desktop_webmcp", { operation: "navigate" })).toEqual({
      displayName: "navigate",
      icon: "global",
    })
  })

  test("keeps unknown tools visible by their original name", () => {
    expect(getPermissionToolPresentation("custom_tool")).toEqual({ displayName: "custom_tool", icon: "tools" })
  })
})
