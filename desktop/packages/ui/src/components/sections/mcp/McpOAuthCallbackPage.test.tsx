import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { McpOAuthCallbackPage } = await import("./McpOAuthCallbackPage")
const { useMcpStore } = await import("@/stores/useMcpStore")

describe("McpOAuthCallbackPage exchange", () => {
  let container: HTMLDivElement
  let root: Root
  let completeAuth: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>

  const renderCallback = (strict = false) => {
    const page = <McpOAuthCallbackPage />
    act(() => root.render(strict ? <React.StrictMode>{page}</React.StrictMode> : page))
  }

  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  // The exchange guard is module state, so every test starts from a code it has not seen.
  let codeCounter = 0
  beforeEach(() => {
    codeCounter += 1
    window.history.replaceState({}, "", `/?code=code-${codeCounter}&state=state-${codeCounter}`)
    completeAuth = vi.fn(async () => {})
    fetchMock = vi.fn(async (_url: string, init?: { method?: string }) => {
      if (init?.method === "DELETE") {
        return { ok: true, json: async () => ({}) }
      }
      return { ok: true, json: async () => ({ name: "server-a", directory: null }) }
    })
    vi.stubGlobal("fetch", fetchMock)
    useMcpStore.setState({ completeAuth: completeAuth as never } as never)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    window.history.replaceState({}, "", "/")
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("exchanges the code once and reports success", async () => {
    renderCallback()
    await flush()

    expect(completeAuth).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("Authorization completed")
  })

  test("does not exchange the single-use code twice", async () => {
    // React's development StrictMode invokes the effect twice, and the second exchange fails at the
    // provider: the success this page had just shown was replaced by a failure it caused itself.
    renderCallback(true)
    await flush()

    expect(completeAuth).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("Authorization completed")
  })

  test("reports a failed exchange and lets a retry try again", async () => {
    completeAuth.mockRejectedValueOnce(new Error("invalid_grant"))
    renderCallback()
    await flush()

    expect(container.textContent).toContain("invalid_grant")

    act(() => root.unmount())
    root = createRoot(container)
    renderCallback()
    await flush()

    expect(completeAuth).toHaveBeenCalledTimes(2)
  })
})
