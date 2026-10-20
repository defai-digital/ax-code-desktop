import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createDesktopUiTools, installDesktopUiWebMcp } from "./desktopUiWebMcp"
import type { UiTool } from "./desktopUiWebMcp"

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (document as Document & { modelContext?: unknown }).modelContext
  delete (window as unknown as { __AX_CODE_DESKTOP_ELECTRON__?: unknown }).__AX_CODE_DESKTOP_ELECTRON__
  document.body.innerHTML = ""
})

const stateOf = (tools: UiTool[]) =>
  tools[0].execute({}) as {
    controls: { ref: string; name: string; disabled: boolean; fillable: boolean }[]
  }

describe("Desktop UI WebMCP", () => {
  test("observes the configuration overlay on reads, pagination and actions without echoing its text", () => {
    document.body.innerHTML = '<div data-config-update-overlay>Private operation detail</div><input aria-label="Draft">' + "<button>Next</button>".repeat(101)
    const { tools, dispose } = createDesktopUiTools(document)
    type Snapshot = { configurationOverlayVisible: boolean; nextOffset: number; controls: { ref: string }[] }
    try {
      const first = tools[0].execute({}) as Snapshot
      expect(first.configurationOverlayVisible).toBe(true)
      expect(JSON.stringify(first)).not.toContain("Private operation detail")
      const filled = tools[2].execute({ ref: first.controls[0].ref, value: "private-draft" }) as { ui: Snapshot }
      expect(filled.ui.configurationOverlayVisible).toBe(true)
      expect(JSON.stringify(filled)).not.toContain("private-draft")
      const next = tools[0].execute({ offset: first.nextOffset }) as Snapshot
      expect(next.configurationOverlayVisible).toBe(true)
      document.querySelector('[data-config-update-overlay]')!.remove()
      const clicked = tools[1].execute({ ref: next.controls[0].ref }) as { ui: Snapshot }
      expect(clicked.ui.configurationOverlayVisible).toBe(false)
      expect((tools[0].execute({}) as Snapshot).configurationOverlayVisible).toBe(false)
    } finally { dispose() }
  })

  test("a hidden configuration overlay is not reported as visible", () => {
    document.body.innerHTML = '<div data-config-update-overlay hidden>Hidden</div>'
    const { tools, dispose } = createDesktopUiTools(document)
    try { expect((tools[0].execute({}) as { configurationOverlayVisible: boolean }).configurationOverlayVisible).toBe(false) }
    finally { dispose() }
  })

  test("reports document focus on reads and action responses without exposing input values", () => {
    document.body.innerHTML = '<input aria-label="Top P" value="private-draft"><button>Next</button>'
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false)
    const { tools, dispose } = createDesktopUiTools(document)
    try {
      const read = tools[0].execute({}) as { documentFocused: boolean; controls: { ref: string }[] }
      expect(read.documentFocused).toBe(false)
      expect(JSON.stringify(read)).not.toContain("private-draft")
      const filled = tools[2].execute({ ref: read.controls[0].ref, value: "2" }) as { ui: { documentFocused: boolean; controls: { ref: string }[] } }
      expect(filled.ui.documentFocused).toBe(false)
      expect(JSON.stringify(filled)).not.toContain("private-draft")
      focus.mockReturnValue(true)
      const clicked = tools[1].execute({ ref: filled.ui.controls[1].ref }) as { ui: { documentFocused: boolean } }
      expect(clicked.ui.documentFocused).toBe(true)
      expect((tools[0].execute({}) as { documentFocused: boolean }).documentFocused).toBe(true)
    } finally { dispose() }
  })

  test("clicks the real rendered handler and rejects stale or replaced controls", () => {
    document.body.innerHTML = '<button aria-label="Settings">Open</button>'
    const button = document.querySelector("button")!
    const handler = vi.fn()
    button.addEventListener("click", handler)
    const { tools } = createDesktopUiTools(document)
    const initial = stateOf(tools)
    tools[1].execute({ ref: initial.controls[0].ref })
    expect(handler).toHaveBeenCalledOnce()
    expect(() => tools[1].execute({ ref: initial.controls[0].ref })).toThrow(/Stale/)
    const current = stateOf(tools)
    button.setAttribute("aria-label", "Delete project")
    expect(() => tools[1].execute({ ref: current.controls[0].ref })).toThrow(/changed/)
    const replaced = stateOf(tools)
    button.replaceWith(button.cloneNode(true))
    expect(() => tools[1].execute({ ref: replaced.controls[0].ref })).toThrow(/Stale/)
  })

  test("excludes hidden controls, bounds output and never reads input values", () => {
    document.body.innerHTML =
      '<input aria-label="Search" value="private-value"><button hidden>Hidden</button><div aria-hidden="true"><button>Also hidden</button></div>'
    const { tools } = createDesktopUiTools(document)
    const state = stateOf(tools)
    expect(state.controls).toHaveLength(1)
    expect(JSON.stringify(state)).not.toContain("private-value")
    document.body.innerHTML = "<button>Item</button>".repeat(101)
    const bounded = tools[0].execute({}) as { controls: unknown[]; truncated: boolean }
    expect(bounded.controls).toHaveLength(100)
    expect(bounded.truncated).toBe(true)
  })

  test("rejects disabled, sensitive and invalid actions at invocation time", () => {
    document.body.innerHTML =
      '<button>Save</button><input type="password" aria-label="Password"><input aria-label="API key"><input type="file">'
    const { tools, dispose } = createDesktopUiTools(document)
    const state = stateOf(tools)
    document.querySelector("button")!.disabled = true
    expect(() => tools[1].execute({ ref: state.controls[0].ref })).toThrow(/disabled/)
    for (const control of state.controls.slice(1)) {
      expect(control.fillable).toBe(false)
      expect(() => tools[2].execute({ ref: control.ref, value: "secret" })).toThrow(/not available/)
    }
    expect(() => tools[2].execute({ ref: state.controls[1].ref, value: "a".repeat(4001) })).toThrow(/4000/)
    expect(() => tools[0].execute({ script: "bad" })).toThrow(/Unknown/)
    dispose()
    expect(() => tools[0].execute({})).toThrow(/disconnected/)
  })

  test("discovers and invokes select options and menu items instead of hiding them", () => {
    document.body.innerHTML =
      '<div role="option" tabindex="-1">English</div><div role="menuitem" tabindex="-1">Rename</div>'
    const handler = vi.fn()
    document.querySelector('[role="option"]')!.addEventListener("click", handler)
    const { tools } = createDesktopUiTools(document)
    const state = stateOf(tools)
    expect(state.controls.map((control) => control.name)).toEqual(["English", "Rename"])
    tools[1].execute({ ref: state.controls[0].ref })
    expect(handler).toHaveBeenCalledOnce()
    expect(document.activeElement?.textContent).toBe("English")
  })

  test("paginates every rendered control and rejects malformed offsets", () => {
    document.body.innerHTML = Array.from({ length: 205 }, (_, i) => `<button>Item ${i}</button>`).join("")
    const { tools } = createDesktopUiTools(document)
    const page = tools[0].execute({ offset: 200 }) as {
      total: number
      nextOffset: number | null
      controls: { ref: string; name: string }[]
    }
    expect(page.total).toBe(205)
    expect(page.nextOffset).toBeNull()
    expect(page.controls.map((control) => control.name)).toEqual([
      "Item 200",
      "Item 201",
      "Item 202",
      "Item 203",
      "Item 204",
    ])
    const handler = vi.fn()
    document.querySelectorAll("button")[204].addEventListener("click", handler)
    tools[1].execute({ ref: page.controls[4].ref })
    expect(handler).toHaveBeenCalledOnce()
    const after = tools[0].execute({ offset: 200 }) as { controls: { ref: string }[] }
    const action = tools[1].execute({ ref: after.controls[0].ref }) as { ui: { offset: number } }
    expect(action.ui.offset).toBe(200)
    for (const offset of [-1, 0.5, "100", 100001]) expect(() => tools[0].execute({ offset })).toThrow(/offset/)
  })

  test("moves focus when filling and clicking so blur-based validation can commit", () => {
    document.body.innerHTML = '<input aria-label="Amount"><button>Save</button>'
    const blur = vi.fn()
    document.querySelector("input")!.addEventListener("blur", blur)
    const { tools } = createDesktopUiTools(document)
    tools[2].execute({ ref: stateOf(tools).controls[0].ref, value: "100" })
    expect(document.activeElement).toBe(document.querySelector("input"))
    tools[1].execute({ ref: stateOf(tools).controls[1].ref })
    expect(blur).toHaveBeenCalledOnce()
  })

  test("focuses read-only capture fields without permitting writes and reports disabled fields consistently", () => {
    document.body.innerHTML = '<input aria-label="Shortcut" readonly><input aria-label="Budget" aria-disabled="true">'
    const { tools } = createDesktopUiTools(document)
    const state = stateOf(tools)
    expect(state.controls[1].fillable).toBe(false)
    tools[1].execute({ ref: state.controls[0].ref })
    expect(document.activeElement).toBe(document.querySelector("input"))
    expect(() => tools[2].execute({ ref: stateOf(tools).controls[0].ref, value: "x" })).toThrow(/not available/)
  })

  test.each(["email", "url", "number"])("fills ordinary %s fields while excluding credential hints", (type) => {
    document.body.innerHTML = `<input type="${type}" aria-label="Field"><input aria-label="Authentication" placeholder="Paste bearer token">`
    const { tools } = createDesktopUiTools(document)
    const state = stateOf(tools)
    expect(state.controls[0].fillable).toBe(true)
    expect(state.controls[1].fillable).toBe(false)
    tools[2].execute({ ref: state.controls[0].ref, value: type === "number" ? "42" : "hello" })
    expect(document.querySelector("input")!.value).toBe(type === "number" ? "42" : "hello")
  })

  test("fills a React controlled input through its actual change handler without submitting", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    function Form() {
      const [value, setValue] = React.useState("")
      return (
        <>
          <input aria-label="Search" value={value} onChange={(event) => setValue(event.target.value)} />
          <p>{value}</p>
        </>
      )
    }
    const root = createRoot(document.getElementById("root")!)
    try {
      await act(async () => root.render(<Form />))
      const { tools } = createDesktopUiTools(document)
      const state = stateOf(tools)
      await act(async () => {
        tools[2].execute({ ref: state.controls[0].ref, value: "search result" })
      })
      expect(document.querySelector("p")!.textContent).toBe("search result")
    } finally {
      await act(async () => root.unmount())
    }
  })

  test("registers nothing without the preload opt-in or a secure context", async () => {
    const registerTool = vi.fn()
    Object.assign(document, { modelContext: { registerTool } })
    await installDesktopUiWebMcp(document)
    expect(registerTool).not.toHaveBeenCalled()
    Object.assign(window, { __AX_CODE_DESKTOP_ELECTRON__: { uiWebMcpEnabled: true } })
    vi.stubGlobal("isSecureContext", false)
    await installDesktopUiWebMcp(document)
    expect(registerTool).not.toHaveBeenCalled()
  })

  test("registers native tools and revokes both registration and held callbacks on pagehide", async () => {
    const registerTool = vi.fn()
    Object.assign(document, { modelContext: { registerTool } })
    Object.assign(window, { __AX_CODE_DESKTOP_ELECTRON__: { uiWebMcpEnabled: true } })
    vi.stubGlobal("isSecureContext", true)
    const dispose = await installDesktopUiWebMcp(document)
    expect(registerTool).toHaveBeenCalledTimes(3)
    const [tool, options] = registerTool.mock.calls[0]
    expect(options.signal.aborted).toBe(false)
    window.dispatchEvent(new Event("pagehide"))
    expect(options.signal.aborted).toBe(true)
    expect(() => tool.execute({})).toThrow(/disconnected/)
    dispose()
  })

  test("cleans up partial registration on native errors", async () => {
    const registerTool = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Native failure"))
    Object.assign(document, { modelContext: { registerTool } })
    Object.assign(window, { __AX_CODE_DESKTOP_ELECTRON__: { uiWebMcpEnabled: true } })
    vi.stubGlobal("isSecureContext", true)
    await expect(installDesktopUiWebMcp(document)).rejects.toThrow(/Native failure/)
    expect(registerTool.mock.calls[0][1].signal.aborted).toBe(true)
  })
})
