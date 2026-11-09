import { afterEach, describe, expect, it, vi } from "vitest"
import { discardResponseBody, fetchWithQuotaTimeout } from "./fetch.js"

describe("fetchWithQuotaTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("adds a bounded abort signal when the caller provides none", async () => {
    // Without it, a hung upstream wedges the caller's single-flight guard forever (the
    // quota dropdown spins until the app is reloaded).
    const spy = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", spy)

    await fetchWithQuotaTimeout("https://example.com/usage", { headers: { A: "b" } })

    const [, options] = spy.mock.calls[0]
    expect(options.headers.A).toBe("b")
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it("keeps a caller-supplied signal", async () => {
    const spy = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", spy)

    const controller = new AbortController()
    await fetchWithQuotaTimeout("https://example.com/usage", { signal: controller.signal })

    expect(spy.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe("discardResponseBody", () => {
  it("does not leave an unhandled rejection when the body has already errored", async () => {
    // A bare `response.body?.cancel()` rejects for an errored body (the timeout fired after the headers),
    // and the server has no unhandled-rejection handler.
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const response = new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection reset"))
          },
        }),
        { status: 500 },
      )

      discardResponseBody(response)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("releases an unread body and ignores a response without one", async () => {
    const response = new Response("error details", { status: 401 })
    discardResponseBody(response)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(response.text()).rejects.toThrow()
    expect(() => discardResponseBody({ ok: false })).not.toThrow()
    expect(() => discardResponseBody(null)).not.toThrow()
  })
})
