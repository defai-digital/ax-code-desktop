import { describe, expect, it, vi } from "vitest"

const requestHook = { handler: null }
const OctokitMock = vi.fn(function () {
  return {
    hook: {
      wrap: (_name, handler) => {
        requestHook.handler = handler
      },
    },
  }
})
vi.mock("@octokit/rest", () => ({ Octokit: OctokitMock }))
vi.mock("./auth.js", () => ({ getGitHubAuth: vi.fn(() => ({ accessToken: "tok-1" })) }))

const { getOctokitOrNull } = await import("./octokit.js")

describe("getOctokitOrNull", () => {
  it("bounds every upstream call with an abort signal", async () => {
    // `request: { timeout }` is not read by @octokit/request's fetch transport (it only
    // forwards `request.signal`), so a hung GitHub endpoint wedged the caller's
    // single-flight refresh. The timeout is applied by a request hook instead.
    vi.useFakeTimers()
    try {
      getOctokitOrNull()
      expect(OctokitMock).toHaveBeenCalledWith({ auth: "tok-1" })
      expect(typeof requestHook.handler).toBe("function")

      let capturedSignal = null
      const request = vi.fn(async (options) => {
        capturedSignal = options.request?.signal
        return { data: [] }
      })

      await requestHook.handler(request, { method: "GET", url: "/x", request: {} })
      expect(capturedSignal).toBeInstanceOf(AbortSignal)
      expect(capturedSignal.aborted).toBe(false)

      // A caller-provided signal is combined, not replaced.
      const controller = new AbortController()
      await requestHook.handler(request, { method: "GET", url: "/x", request: { signal: controller.signal } })
      expect(capturedSignal.aborted).toBe(false)
      controller.abort()
      expect(capturedSignal.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("aborts a hung request after the timeout", async () => {
    vi.useFakeTimers()
    try {
      getOctokitOrNull()
      let capturedSignal = null
      const request = vi.fn(async (options) => {
        capturedSignal = options.request.signal
        return new Promise(() => {})
      })

      void requestHook.handler(request, { method: "GET", url: "/x", request: {} })
      expect(capturedSignal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(15_001)
      expect(capturedSignal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
