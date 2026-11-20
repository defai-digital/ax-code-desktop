import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join("|")}` : key,
  }),
}))

vi.mock("@/hooks/useNow", () => ({ useNow: () => 200_000 }))

const requestSessionRecap = vi.hoisted(() => vi.fn())
vi.mock("@/lib/supervision/sessionRecap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supervision/sessionRecap")>()
  return { ...actual, requestSessionRecap }
})

import type { SessionRecap } from "@/lib/supervision/sessionRecap"
import { ReturnToWorkRecapStrip } from "./ReturnToWorkRecapStrip"

type StripProps = React.ComponentProps<typeof ReturnToWorkRecapStrip>

const NOW = 200_000

const RECAP: SessionRecap = { text: "Shipped the retry fix", time: 100_000, scope: "turn" }
const SECOND_RECAP: SessionRecap = { text: "Second session recap", time: 150_000, scope: "conversation" }

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe("return to work recap strip", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    requestSessionRecap.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const strip = () => container.querySelector("[data-return-to-work-recap]")

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label || candidate.getAttribute("aria-label") === label,
    )

  const renderStrip = (overrides: Partial<StripProps> = {}) => {
    act(() =>
      root.render(
        <ReturnToWorkRecapStrip
          sessionId="ses_1"
          directory="/repo/project"
          sessionUpdatedAt={null}
          initialRecap={RECAP}
          isIdle
          {...overrides}
        />,
      ),
    )
  }

  const flush = () =>
    act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

  test("renders the recap while the session is idle", () => {
    renderStrip()

    expect(strip()).not.toBeNull()
    expect(strip()?.getAttribute("role")).toBe("region")
    expect(strip()?.getAttribute("aria-label")).toBe("supervision.recap.title")
    expect(container.textContent).toContain("Shipped the retry fix")
    expect(container.textContent).toContain("supervision.recap.title")
    expect(container.textContent).toContain("supervision.recap.updatedAgo:")
  })

  test("hides while the session is running", () => {
    renderStrip({ isIdle: false })
    expect(strip()).toBeNull()
  })

  test("hides without a session id or without a recap", () => {
    renderStrip({ sessionId: null })
    expect(strip()).toBeNull()

    renderStrip({ initialRecap: null })
    expect(strip()).toBeNull()
  })

  test("flags the recap stale once the session moved past it", () => {
    renderStrip({ sessionUpdatedAt: RECAP.time + 500 })
    expect(container.textContent).not.toContain("supervision.recap.stale")

    renderStrip({ sessionUpdatedAt: RECAP.time + 60_000 })
    expect(container.textContent).toContain("supervision.recap.stale")
  })

  test("a stale recap is dashed and neutral with the stale mark, and a fresh one carries no verdict mark", () => {
    renderStrip({ sessionUpdatedAt: RECAP.time + 500 })
    const fresh = container.querySelector<HTMLElement>("[data-return-to-work-recap]")!
    expect(fresh.hasAttribute("data-recap-stale")).toBe(false)
    // A recap is a summary, not a verification result: it must not show a success mark.
    expect(fresh.querySelector("[data-status-mark]")).toBeNull()

    renderStrip({ sessionUpdatedAt: RECAP.time + 60_000 })
    const stale = container.querySelector<HTMLElement>("[data-return-to-work-recap]")!
    expect(stale.hasAttribute("data-recap-stale")).toBe(true)
    expect(stale.className).toContain("border-dashed")
    expect(stale.className).not.toMatch(/status-(warning|error|success)/)
    expect(stale.querySelector("[data-status-mark]")?.getAttribute("data-status-mark")).toBe("stale")
  })

  test("shows the version seal the caller supplies", () => {
    renderStrip({ seal: <span data-test-seal="">b4e19f2</span> })
    expect(container.querySelector("[data-test-seal]")?.textContent).toBe("b4e19f2")
  })

  test("refreshes the recap and shows the new text", async () => {
    requestSessionRecap.mockResolvedValue({ text: "Fresh recap", time: NOW, scope: "conversation" })
    renderStrip()

    act(() => button("supervision.recap.refresh")?.click())
    expect(container.textContent).toContain("supervision.recap.refreshing")

    await flush()

    expect(requestSessionRecap).toHaveBeenCalledWith({
      sessionId: "ses_1",
      directory: "/repo/project",
      scope: "turn",
      signal: expect.any(AbortSignal),
    })
    expect(container.textContent).toContain("Fresh recap")
    expect(container.textContent).not.toContain("supervision.recap.refreshing")
  })

  test("discards a reply that arrives after switching sessions", async () => {
    const pending = deferred<SessionRecap | null>()
    requestSessionRecap.mockReturnValue(pending.promise)
    renderStrip()

    act(() => button("supervision.recap.refresh")?.click())
    renderStrip({ sessionId: "ses_2", initialRecap: SECOND_RECAP })
    expect(container.textContent).toContain("Second session recap")

    pending.resolve({ text: "Late reply for ses_1", time: NOW, scope: "conversation" })
    await flush()

    expect(container.textContent).toContain("Second session recap")
    expect(container.textContent).not.toContain("Late reply for ses_1")
  })

  test("keeps the current recap when a refresh fails", async () => {
    requestSessionRecap.mockResolvedValue(null)
    renderStrip()

    act(() => button("supervision.recap.refresh")?.click())
    await flush()

    expect(container.textContent).toContain("Shipped the retry fix")
    expect(button("supervision.recap.refresh")).toBeDefined()
    expect(container.textContent).not.toContain("supervision.recap.refreshing")
  })

  test("dismisses the strip for the dismissed session only", () => {
    renderStrip()
    act(() => button("supervision.recap.dismiss")?.click())
    expect(strip()).toBeNull()

    renderStrip({ sessionId: "ses_2", initialRecap: SECOND_RECAP })
    expect(strip()).not.toBeNull()

    renderStrip()
    expect(strip()).toBeNull()
  })

  test("requests the changes review from the strip", () => {
    const onReviewChanges = vi.fn()
    renderStrip({ hasChanges: true, onReviewChanges })

    act(() => button("supervision.recap.reviewChanges")?.click())

    expect(onReviewChanges).toHaveBeenCalledTimes(1)
  })

  test("hides the review action when there is nothing to review", () => {
    renderStrip({ hasChanges: false, onReviewChanges: vi.fn() })
    expect(button("supervision.recap.reviewChanges")).toBeUndefined()
  })
})
