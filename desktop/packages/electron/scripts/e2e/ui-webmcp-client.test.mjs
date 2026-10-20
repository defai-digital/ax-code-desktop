import { describe, expect, test } from "vitest"
import { createRequire } from "node:module"
import { UiWebMcpClient, UI_TOOL_NAMES } from "./ui-webmcp-client.mjs"

const require = createRequire(import.meta.url)
const { isDesktopUiWebMcpEnabled } = require("../../src/webview-policy.js")

const fakeSession = ({ status = "Completed", early = false } = {}) => {
  const listeners = new Map()
  const emit = (name, params) => listeners.get(name)?.(params)
  const calls = []
  return {
    calls,
    emit,
    on: (name, callback) => listeners.set(name, callback),
    send: async (method, params) => {
      calls.push({ method, params })
      if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main" } } }
      if (method === "WebMCP.enable") {
        emit("WebMCP.toolsAdded", {
          tools: [
            ...UI_TOOL_NAMES.map((name) => ({ name, frameId: "main" })),
            { name: "ax_desktop_click", frameId: "guest" },
            { name: "other_tool", frameId: "main" },
          ],
        })
      }
      if (method === "WebMCP.invokeTool") {
        const respond = () =>
          emit("WebMCP.toolResponded", { invocationId: "invoke-1", status, output: { rendered: true } })
        if (early) respond()
        else setTimeout(respond, 0)
        return { invocationId: "invoke-1" }
      }
      return {}
    },
  }
}

describe("development UI WebMCP policy", () => {
  test("requires an explicit opt-in and disables every packaged launch", () => {
    expect(isDesktopUiWebMcpEnabled(false, {})).toBe(false)
    expect(isDesktopUiWebMcpEnabled(false, { AX_CODE_DESKTOP_UI_WEBMCP: "true" })).toBe(false)
    expect(isDesktopUiWebMcpEnabled(false, { AX_CODE_DESKTOP_UI_WEBMCP: "1" })).toBe(true)
    expect(isDesktopUiWebMcpEnabled(true, { AX_CODE_DESKTOP_UI_WEBMCP: "1" })).toBe(false)
  })
})

describe("native UI WebMCP driver", () => {
  test.each([false, true])("discovers main-frame tools and accepts native completion (early=%s)", async (early) => {
    const session = fakeSession({ early })
    const client = new UiWebMcpClient(session)
    expect((await client.enable()).map((tool) => tool.name)).toEqual(UI_TOOL_NAMES)
    expect(client.tools.get("ax_desktop_click").frameId).toBe("main")
    await expect(client.call("ax_desktop_get_ui_state")).resolves.toEqual({ rendered: true })
    expect(session.calls.find((call) => call.method === "WebMCP.invokeTool").params).toEqual({
      frameId: "main",
      toolName: "ax_desktop_get_ui_state",
      input: {},
    })
    await expect(client.call("other_tool")).rejects.toThrow(/Unknown/)
  })

  test("reports native failures and invalidates the catalog after navigation", async () => {
    const session = fakeSession({ status: "Error" })
    const client = new UiWebMcpClient(session)
    await client.enable()
    await expect(client.call("ax_desktop_click", { ref: "bad" })).rejects.toThrow(/Error/)
    session.emit("Page.frameNavigated", { frame: { id: "next" } })
    expect(client.tools.size).toBe(0)
    await expect(client.call("ax_desktop_click")).rejects.toThrow(/Unknown/)
  })
})
