import { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { WebMcpToolPanel } from "./WebMcpToolPanel"

afterEach(() => {
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
})

const catalog = [
  {
    name: "add_numbers",
    description: "Add two integers",
    inputSchema: { type: "object", properties: { a: { type: "integer" }, b: { type: "integer" } }, required: ["a", "b"] },
  },
]

describe("WebMCP tool panel", () => {
  test("shows the page's tools while agent access is off and runs one as the user", async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", enabled: false, catalog })
    const tryTool = vi.fn(async () => ({ ok: true, output: { content: [{ type: "text", text: "5" }] } }))
    const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    const [a, b] = [...container.querySelectorAll<HTMLInputElement>("input")]
    fireEvent.change(a, { target: { value: "2" } })
    fireEvent.change(b, { target: { value: "3" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    })
    expect(tryTool).toHaveBeenCalledWith("add_numbers", { a: 2, b: 3 })
    expect(container.querySelector("[data-webmcp-tool-result='ok']")?.textContent).toContain('"text": "5"')
  })

  test("an invalid value is reported before anything runs, and a failed run says so", async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog })
    const tryTool = vi.fn(async () => ({ ok: false, reason: "invoke-failed" }))
    const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    })
    expect(tryTool).not.toHaveBeenCalled()
    expect(container.textContent).toContain("webmcp.tools.invalidField:a")
    const [a, b] = [...container.querySelectorAll<HTMLInputElement>("input")]
    fireEvent.change(a, { target: { value: "1" } })
    fireEvent.change(b, { target: { value: "1" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    })
    expect(container.querySelector("[data-webmcp-tool-result='error']")?.textContent).toBe("webmcp.tools.failed")
  })

  test("renders nothing without a page origin or tools", () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: null, catalog })
    expect(render(<WebMcpToolPanel tryTool={vi.fn()} />).container.innerHTML).toBe("")
  })
})
