// Native WebMCP client for the explicitly launched development renderer only.
import { waitForCondition } from "./cdp.mjs"

export const UI_TOOL_NAMES = ["ax_desktop_get_ui_state", "ax_desktop_click", "ax_desktop_fill"]

export class UiWebMcpClient {
  tools = new Map()
  #session
  #frameId
  #active = null

  constructor(session) {
    this.#session = session
    session.on("Page.frameNavigated", ({ frame }) => {
      if (!frame.parentId) {
        this.#frameId = frame.id
        this.tools.clear()
        if (this.#active) this.#active.invalidated = true
      }
    })
    session.on("WebMCP.toolsAdded", ({ tools }) => {
      for (const tool of tools ?? []) {
        if (tool.frameId === this.#frameId && UI_TOOL_NAMES.includes(tool.name)) this.tools.set(tool.name, tool)
      }
    })
    session.on("WebMCP.toolsRemoved", ({ tools }) => {
      for (const tool of tools ?? []) if (tool.frameId === this.#frameId) this.tools.delete(tool.name)
    })
    session.on("WebMCP.toolResponded", (response) => {
      const active = this.#active
      if (!active || active.responses.length >= 8) return
      if (!active.id || active.id === response.invocationId) active.responses.push(response)
    })
  }

  async enable() {
    await this.#session.send("Page.enable")
    const { frameTree } = await this.#session.send("Page.getFrameTree")
    this.#frameId = frameTree.frame.id
    await this.#session.send("WebMCP.enable")
    await waitForCondition(() => UI_TOOL_NAMES.every((name) => this.tools.has(name)), {
      label: "Desktop UI WebMCP tools",
    })
    return [...this.tools.values()]
  }

  async call(name, input = {}) {
    if (this.#active) throw new Error("Only one UI WebMCP call may run at a time")
    const tool = this.tools.get(name)
    if (!tool || !UI_TOOL_NAMES.includes(name)) throw new Error("Unknown Desktop UI tool")
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 16_384) {
      throw new Error("Invalid Desktop UI tool input")
    }
    const active = { id: null, responses: [], invalidated: false }
    this.#active = active
    try {
      const { invocationId } = await this.#session.send("WebMCP.invokeTool", {
        frameId: tool.frameId,
        toolName: name,
        input,
      })
      active.id = invocationId
      const response = await waitForCondition(
        () => {
          if (active.invalidated) return { status: "Invalidated" }
          return active.responses.find((entry) => entry.invocationId === invocationId)
        },
        { timeoutMs: 10_000, label: `native response for ${name}` },
      )
      if (response.status !== "Completed")
        throw new Error(`WebMCP ${name}: ${response.status}; ${JSON.stringify(response.output ?? "")}`)
      return response.output
    } catch (error) {
      if (active.id) await this.#session.send("WebMCP.cancelInvocation", { invocationId: active.id }).catch(() => {})
      throw error
    } finally {
      this.#active = null
    }
  }
}

export const journeyUiWebMcp = async ({ session }) => {
  const client = new UiWebMcpClient(session)
  await client.enable()
  const before = await client.call("ax_desktop_get_ui_state")
  const settings = before.controls.find((control) => /settings/i.test(control.name) && !control.disabled)
  if (!settings) throw new Error(`No Settings control in native UI snapshot: ${JSON.stringify(before)}`)
  await client.call("ax_desktop_click", { ref: settings.ref })
  await waitForCondition(() => session.evaluate('document.querySelector("[data-settings-view]") !== null'), {
    label: "Settings rendered after native WebMCP click",
  })
  const after = await client.call("ax_desktop_get_ui_state")
  if (!after.settingsOpen) throw new Error("WebMCP state did not reflect the rendered Settings view")
  const search = after.controls.find((control) => control.fillable && control.name === "Search settings")
  if (!search) throw new Error("Settings search field was not exposed by native WebMCP")
  await client.call("ax_desktop_fill", { ref: search.ref, value: "zzzzwebmcpnomatch" })
  await waitForCondition(
    () =>
      session.evaluate(`(() => {
    const view = document.querySelector('[data-settings-view]')
    const input = view?.querySelector('input[placeholder="Search settings"]')
    return input?.value === "zzzzwebmcpnomatch" &&
      !Array.from(view.querySelectorAll('button')).some(button => button.textContent.trim() === "Appearance")
  })()`),
    { label: "React search filtering after native WebMCP fill" },
  )
  const filtered = await client.call("ax_desktop_get_ui_state")
  const clear = filtered.controls.find((control) => control.fillable && control.name === "Search settings")
  await client.call("ax_desktop_fill", { ref: clear?.ref, value: "" })
  await waitForCondition(
    () =>
      session.evaluate(`Array.from(document.querySelectorAll('[data-settings-view] button'))
    .some(button => button.textContent.trim() === "Appearance")`),
    { label: "Settings navigation restored" },
  )
  return {
    name: "ui-webmcp",
    ok: true,
    detail: "three native tools invoked; real Settings opened, search filtered React navigation and restored it",
  }
}
