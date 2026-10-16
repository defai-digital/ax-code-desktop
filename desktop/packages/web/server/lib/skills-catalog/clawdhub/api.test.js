import { afterEach, describe, expect, test, vi } from "vitest"

const {
  downloadClawdHubSkill,
  fetchClawdHubSkills,
  readBodyWithinLimit,
  MAX_SKILL_ARCHIVE_BYTES,
} = await import("./api.js")

const streamOf = (chunks) =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })

describe("clawdhub download size cap", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("refuses a response whose declared size is over the cap", async () => {
    // A malicious or compromised publisher serves a multi-gigabyte archive: the body used to be read
    // whole into memory and then extracted under os.tmpdir().
    globalThis.fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-length": String(MAX_SKILL_ARCHIVE_BYTES + 1) },
        }),
    )

    await expect(downloadClawdHubSkill("skill", "latest")).rejects.toThrow("larger than the 32 MB limit")
  })

  test("cancels the body it refuses on the declared size", async () => {
    // Throwing without cancelling left the connection open until the response was collected.
    let cancelled = false
    const response = {
      headers: { get: (name) => (name === "content-length" ? String(MAX_SKILL_ARCHIVE_BYTES + 1) : null) },
      body: { cancel: async () => { cancelled = true } },
    }

    await expect(readBodyWithinLimit(response, MAX_SKILL_ARCHIVE_BYTES)).rejects.toThrow("larger than the 32 MB limit")
    expect(cancelled).toBe(true)
  })

  test("stops reading a body that outgrows the cap", async () => {
    const cancelled = { current: false }
    const response = {
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(4))
          controller.enqueue(new Uint8Array(4))
          controller.enqueue(new Uint8Array(4))
        },
        cancel() {
          cancelled.current = true
        },
      }),
    }

    await expect(readBodyWithinLimit(response, 8)).rejects.toThrow("larger than the 0 MB limit")
    expect(cancelled.current).toBe(true)
  })

  test("returns a body within the cap unchanged", async () => {
    const response = {
      headers: { get: () => null },
      body: streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]),
    }

    const buffer = await readBodyWithinLimit(response, 8)
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3])
  })

  test("checks the size even when the body cannot be streamed", async () => {
    const response = { headers: { get: () => null }, arrayBuffer: async () => new Uint8Array(9).buffer }

    await expect(readBodyWithinLimit(response, 8)).rejects.toThrow("larger than the 0 MB limit")
  })
})

describe("clawdhub retry bodies", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("releases the body of a response it retries", async () => {
    // An unconsumed body keeps its socket until the response is collected, and the rate-limit loop can leave
    // nine of them per call. The size guard cancels for the same reason.
    const cancelled = []
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return {
          status: 503,
          ok: false,
          statusText: "Service Unavailable",
          body: { cancel: async () => cancelled.push(calls) },
        }
      }
      return {
        status: 200,
        ok: true,
        body: { cancel: async () => {} },
        json: async () => ({ items: [{ slug: "review-code" }] }),
      }
    })

    const result = await fetchClawdHubSkills()

    expect(result.items).toEqual([{ slug: "review-code" }])
    expect(cancelled).toEqual([1])
  })
})
