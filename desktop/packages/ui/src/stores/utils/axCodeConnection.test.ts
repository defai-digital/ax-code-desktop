import { describe, expect, test, vi } from "vitest"

import { waitForAxCodeConnection } from "./axCodeConnection"

describe("waitForAxCodeConnection", () => {
  test("polls until ax-code reports healthy", async () => {
    let currentTime = 0
    const messages: string[] = []
    const sleeps: number[] = []
    const healthResults = [false, false, true]

    await waitForAxCodeConnection(450, {
      checkHealth: async () => healthResults.shift() ?? true,
      updateMessage: (message) => messages.push(message),
      sleepMs: async (ms) => {
        sleeps.push(ms)
        currentTime += ms
      },
      now: () => currentTime,
    })

    expect(messages).toEqual([
      "Waiting for AX Code… (attempt 1)",
      "Waiting for AX Code… (attempt 2)",
      "Waiting for AX Code… (attempt 3)",
    ])
    expect(sleeps).toEqual([450, 300, 300])
  })

  test("throws the last health check error after the wait budget expires", async () => {
    let currentTime = 0
    const error = new Error("not ready")

    let thrown: unknown
    try {
      await waitForAxCodeConnection(undefined, {
        checkHealth: async () => {
          throw error
        },
        updateMessage: () => undefined,
        sleepMs: async (ms) => {
          currentTime += ms
        },
        now: () => currentTime,
        maxWaitMs: 500,
      })
    } catch (caught) {
      thrown = caught
    }

    expect(thrown).toBe(error)
    expect(currentTime).toBe(500)
  })

  test("cancels a stalled health request at the deadline and ignores a late success", async () => {
    vi.useFakeTimers()
    const stalled = Promise.withResolvers<boolean>()
    let signal: AbortSignal | undefined
    try {
      const wait = waitForAxCodeConnection(undefined, {
        maxWaitMs: 1000,
        checkHealth: (probeSignal?: AbortSignal) => {
          signal = probeSignal
          return stalled.promise
        },
        updateMessage: () => undefined,
      })
      const result = wait.then(() => "ready", () => "timed out")
      const deadline = new Promise<string>((resolve) => setTimeout(() => resolve("still waiting"), 1001))
      await vi.advanceTimersByTimeAsync(1001)
      expect(await Promise.race([result, deadline])).toBe("timed out")
      expect(signal?.aborted).toBe(true)
      stalled.resolve(true)
      expect(await result).toBe("timed out")
    } finally {
      stalled.resolve(false)
      vi.useRealTimers()
    }
  })
})
