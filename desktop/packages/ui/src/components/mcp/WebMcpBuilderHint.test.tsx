import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render } from "@/test/dom"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const { openExternalUrl } = vi.hoisted(() => ({ openExternalUrl: vi.fn(async () => true) }))
vi.mock("@/lib/url", () => ({ openExternalUrl }))
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { WEBMCP_PAGE_TOOLS_GUIDE_URL, WebMcpBuilderHint } from "./WebMcpBuilderHint"

afterEach(() => {
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
  openExternalUrl.mockClear()
})

describe("WebMCP builder hint", () => {
  test("says a page registers no tools and opens the guide outside the app", () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: "http://127.0.0.1:4173", catalog: [] })
    const { container } = render(<WebMcpBuilderHint />)
    expect(container.textContent).toContain("webmcp.tools.noneRegistered")
    fireEvent.click(container.querySelector("a")!)
    expect(openExternalUrl).toHaveBeenCalledWith(WEBMCP_PAGE_TOOLS_GUIDE_URL)
  })

  test("keeps only the guide link when the page has tools, and shows nothing without a page", () => {
    useWebMcpBrowserStore
      .getState()
      .updateSnapshot({ origin: "https://shop.test", catalog: [{ name: "list", description: "List", inputSchema: {} }] })
    const { container } = render(<WebMcpBuilderHint />)
    expect(container.textContent).toBe("webmcp.tools.guide")
    cleanup()
    useWebMcpBrowserStore.getState().resetSnapshot()
    expect(render(<WebMcpBuilderHint />).container.textContent).toBe("")
  })
})
