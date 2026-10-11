import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Blob as NodeBlob } from "node:buffer"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { VirtualItem } from "@tanstack/react-virtual"
import { I18nProvider } from "@/lib/i18n"
import { VirtualizedToolOutput } from "./VirtualizedToolOutput"
import { downloadToolOutput, shouldVirtualizeToolOutput } from "./toolOutputText"

const state = vi.hoisted(() => ({ rows: [] as VirtualItem[], notify: () => {}, copy: vi.fn() }))
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: state.copy }))
vi.mock("@tanstack/react-virtual", async () => {
  const React = await import("react")
  const instance = {
    getVirtualItems: () => state.rows,
    getTotalSize: () => 80_000,
    measureElement: vi.fn(),
  }
  return {
    useVirtualizer: () => {
      const [, update] = React.useReducer((value: number) => value + 1, 0)
      state.notify = update
      return instance
    },
  }
})

const row = (index: number): VirtualItem => ({
  index,
  key: index,
  start: index * 20,
  end: (index + 1) * 20,
  size: 20,
  lane: 0,
})
const text =
  Array.from({ length: 4000 }, (_, index) => `Line ${index + 1}: fixture <script>safe text</script>`).join("\r\n") +
  "\r\n"

describe("Large tool output", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    state.rows = [row(0), row(1), row(2)]
    state.copy.mockReset().mockResolvedValue({ ok: true, method: "clipboard" })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  const render = (source = text, identityKey = "tool-one") => {
    act(() =>
      root.render(
        <I18nProvider>
          <VirtualizedToolOutput text={source} identityKey={identityKey} />
        </I18nProvider>,
      ),
    )
  }

  test("bounds mounted lines and updates the range on the same virtualizer instance", () => {
    render()
    expect(container.querySelectorAll("[data-tool-output-line]")).toHaveLength(3)
    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toContain("Line 1:")
    expect(container.textContent).not.toContain("Line 4000:")
    act(() => {
      state.rows = [row(3999), row(4000)]
      state.notify()
    })
    expect(container.textContent).toContain("Line 4000:")
    expect(container.textContent).not.toContain("Line 1:")
    // A trailing newline has its own final empty row.
    expect(container.querySelector('[data-tool-output-line="4001"]')?.textContent).toBe("")
  })

  test("copies the entire original output, including unmounted lines and CRLF", async () => {
    render()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Copy output"]')?.click()
    })
    expect(state.copy).toHaveBeenCalledWith(text)
  })

  test("downloads all source bytes and cleans up its URL and temporary link", async () => {
    vi.stubGlobal("Blob", NodeBlob)
    const create = vi.fn<(blob: Blob) => string>().mockReturnValue("blob:fixture")
    const revoke = vi.fn()
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    downloadToolOutput(text)
    expect(click).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    const blob = create.mock.calls[0][0] as unknown as NodeBlob
    expect(blob.size).toBe(Buffer.byteLength(text))
    expect(await blob.text()).toBe(text)
    expect(revoke).toHaveBeenCalledWith("blob:fixture")
    expect(document.querySelector('a[download="tool-output.txt"]')).toBeNull()
  })

  test("copies updated output and resets scroll when opening a different tool", async () => {
    render()
    const scroller = container.querySelector<HTMLElement>('[role="region"]')!
    scroller.scrollTop = 400
    render(text + "new final line", "tool-two")
    expect(scroller.scrollTop).toBe(0)
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy output"]')?.click())
    expect(state.copy).toHaveBeenCalledWith(text + "new final line")
  })

  test("enables the bounded view by line count or source size", () => {
    expect(shouldVirtualizeToolOutput("short\noutput")).toBe(false)
    expect(shouldVirtualizeToolOutput("line\n".repeat(199))).toBe(false)
    expect(shouldVirtualizeToolOutput("line\n".repeat(200))).toBe(true)
    expect(shouldVirtualizeToolOutput("x".repeat(32767))).toBe(false)
    expect(shouldVirtualizeToolOutput("x".repeat(32768))).toBe(true)
  })
})
