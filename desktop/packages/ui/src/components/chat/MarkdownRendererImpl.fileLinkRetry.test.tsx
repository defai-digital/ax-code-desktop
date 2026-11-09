import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// One stable object, as in the app: a new `editor` per render would re-run the link effect on
// every render and hide whether the effect itself handles new content.
const runtimeAPIs = vi.hoisted(() => ({ editor: {} }))
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => runtimeAPIs }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/contexts/useThemeSystem", () => ({ useOptionalThemeSystem: () => null }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false, isTablet: false }) }))

import { MarkdownRenderer } from "./MarkdownRendererImpl-impl"

describe("markdown file reference links", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
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
    vi.useRealTimers()
  })

  const linked = () => container.querySelector('[data-openchamber-file-link="true"]')

  test("a path that was missing when the message finished becomes a link once the file exists", async () => {
    // The agent creates the file just after its message finished: the first stat misses.
    let exists = false
    const fetchMock = vi.fn(async () => ({ ok: exists }))
    vi.stubGlobal("fetch", fetchMock)

    act(() => {
      root.render(
        <MarkdownRenderer
          content="Created `src/retry-target-unique.ts` for you."
          messageId="m-retry"
          isAnimated={false}
          isStreaming={false}
          enableFileReferences
        />,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalled()
    expect(linked()).toBeNull()

    exists = true
    // A finished message never mutates again; only the bounded retry re-checks it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })
    expect(linked()?.textContent).toBe("src/retry-target-unique.ts")
  })

  test("a path that never appears stops being checked after the bounded retries", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false }))
    vi.stubGlobal("fetch", fetchMock)
    act(() => {
      root.render(
        <MarkdownRenderer
          content="See `src/never-created-unique.ts`."
          messageId="m-missing"
          isAnimated={false}
          isStreaming={false}
          enableFileReferences
        />,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    const checks = fetchMock.mock.calls.length
    // The first check plus three retries.
    expect(checks).toBe(4)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    expect(fetchMock.mock.calls.length).toBe(checks)
    expect(linked()).toBeNull()
  })

  test("a reference added after earlier retries were used up still gets its own retries", async () => {
    const existing = new Set<string>()
    const fetchMock = vi.fn(async (url: string) => ({
      ok: [...existing].some((path) => decodeURIComponent(url).includes(path)),
    }))
    vi.stubGlobal("fetch", fetchMock)
    act(() => {
      root.render(
        <MarkdownRenderer
          content="See `src/first-missing-unique.ts`."
          messageId="m-budget"
          isAnimated={false}
          isStreaming={false}
          enableFileReferences
        />,
      )
    })
    // The first reference exhausts the retry budget.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })

    // New content arrives in the same container; its file appears only after the first check.
    act(() => {
      root.render(
        <MarkdownRenderer
          content="See `src/first-missing-unique.ts` and `src/second-later-unique.ts`."
          messageId="m-budget"
          isAnimated={false}
          isStreaming={false}
          enableFileReferences
        />,
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    existing.add("src/second-later-unique.ts")
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    const linkedTexts = Array.from(container.querySelectorAll('[data-openchamber-file-link="true"]')).map(
      (element) => element.textContent,
    )
    expect(linkedTexts).toEqual(["src/second-later-unique.ts"])
  })
})

