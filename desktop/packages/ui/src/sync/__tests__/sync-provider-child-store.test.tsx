import React from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SyncProvider } from "../sync-context-impl"
import { getSyncChildStores } from "../sync-refs"

// Only the calls the provider's bootstrap makes before it settles are needed; anything
// else it reaches for would be a network call this test should not make.
const stubSdk = {
  session: {
    list: async () => ({ data: [] }),
    messages: async () => ({ data: [] }),
  },
} as never

describe("SyncProvider child-store lifetime", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let mounted = true

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // The provider bootstraps against the stub SDK, which cannot satisfy the real
    // response shapes; the failures are expected and only add noise here.
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    mounted = true
  })

  afterEach(() => {
    if (mounted) {
      React.act(() => {
        root.unmount()
      })
    }
    container.remove()
    vi.restoreAllMocks()
  })

  test("pins the directory it renders for as long as it is mounted", () => {
    React.act(() => {
      root.render(
        React.createElement(SyncProvider, { sdk: stubSdk, directory: "/repo", children: null }),
      )
    })

    // Without the pin the store is evicted once DIR_IDLE_TTL_MS passes without an event,
    // even though the views under this provider are still subscribed to it.
    expect(getSyncChildStores().pinned("/repo")).toBe(true)

    React.act(() => {
      root.unmount()
    })
    mounted = false

    expect(getSyncChildStores().pinned("/repo")).toBe(false)
  })
})
