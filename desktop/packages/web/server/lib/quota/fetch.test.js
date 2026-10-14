import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchWithQuotaTimeout } from "./fetch.js"

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
