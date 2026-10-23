import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ editor: {} }) }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/contexts/useThemeSystem", () => ({ useOptionalThemeSystem: () => null }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false, isTablet: false }) }))

import { MarkdownRenderer } from "./MarkdownRendererImpl-impl"

describe("live markdown block identity", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const renderMarkdown = (content: string, isStreaming: boolean) => {
    act(() => {
      root.render(
        <MarkdownRenderer
          content={content}
          messageId="m1"
          isAnimated={false}
          isStreaming={isStreaming}
          enableFileReferences={false}
        />,
      )
    })
  }

  const blocks = () => Array.from(container.querySelectorAll<HTMLElement>("[data-md-block]"))
  const paragraphs = () => Array.from(container.querySelectorAll<HTMLElement>(".markdown-content p"))

  test("a token append keeps the live block mounted, and live to full remounts once", () => {
    renderMarkdown("Hello", true)
    const tail = paragraphs()
    const wrapper = blocks()
    expect(tail).toHaveLength(1)
    expect(wrapper).toHaveLength(1)
    expect(tail[0]?.textContent).toContain("Hello")

    renderMarkdown("Hello ", true)
    expect(paragraphs()[0]).toBe(tail[0])
    expect(blocks()[0]).toBe(wrapper[0])
    expect(paragraphs()).toHaveLength(1)

    renderMarkdown("Hello\n\nNext", true)
    const split = paragraphs()
    const splitWrappers = blocks()
    expect(split).toHaveLength(2)
    expect(split[0]).not.toBe(tail[0])
    expect(splitWrappers[0]).toBe(wrapper[0])
    expect(split[0]?.textContent).toContain("Hello")
    expect(split[1]?.textContent).toContain("Next")

    renderMarkdown("Hello\n\nNext!", true)
    expect(paragraphs()[0]).toBe(split[0])
    expect(paragraphs()[1]).toBe(split[1])
    expect(blocks()[0]).toBe(wrapper[0])

    renderMarkdown("Hello\n\nNext!", false)
    const finalized = paragraphs()
    expect(blocks()).toHaveLength(0)
    expect(finalized.map((node) => node.textContent)).toEqual(["Hello", "Next!"])
    expect(finalized[0]).not.toBe(split[0])
    expect(finalized[1]).not.toBe(split[1])

    renderMarkdown("Hello\n\nNext!", false)
    expect(paragraphs()[0]).toBe(finalized[0])
    expect(paragraphs()[1]).toBe(finalized[1])

    renderMarkdown("Hello\n\nNext!!", false)
    expect(paragraphs()[0]).not.toBe(finalized[0])
    expect(paragraphs()[1]?.textContent).toBe("Next!!")
  })
})
