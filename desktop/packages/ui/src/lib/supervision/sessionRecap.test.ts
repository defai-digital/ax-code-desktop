import { afterEach, describe, expect, test, vi } from "vitest"

import { axCodeClient } from "@/lib/ax-code/client"

import { isRecapStale, readSessionRecap, requestSessionRecap, type SessionRecap } from "./sessionRecap"

const recap = (overrides: Partial<SessionRecap> = {}): SessionRecap => ({
  text: "Shipped the retry fix",
  time: 100_000,
  scope: "turn",
  ...overrides,
})

describe("readSessionRecap", () => {
  test("normalizes a valid record", () => {
    expect(
      readSessionRecap({ lastRecap: { text: "  Shipped the retry fix  ", time: 12, scope: "conversation" } }),
    ).toEqual({ text: "Shipped the retry fix", time: 12, scope: "conversation" })
  })

  test("defaults an omitted scope to the current turn", () => {
    expect(readSessionRecap({ lastRecap: { text: "Done", time: 5 } })).toEqual({
      text: "Done",
      time: 5,
      scope: "turn",
    })
  })

  test("treats missing, null, and non-object records as no recap", () => {
    expect(readSessionRecap(null)).toBeNull()
    expect(readSessionRecap(undefined)).toBeNull()
    expect(readSessionRecap({})).toBeNull()
    expect(readSessionRecap({ lastRecap: null })).toBeNull()
    expect(readSessionRecap({ lastRecap: "Shipped the retry fix" })).toBeNull()
    expect(readSessionRecap({ lastRecap: 42 })).toBeNull()
  })

  test("rejects a whitespace-only text", () => {
    expect(readSessionRecap({ lastRecap: { text: "   \n\t ", time: 10, scope: "turn" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "", time: 10, scope: "turn" } })).toBeNull()
  })

  test("rejects a text that is not a string", () => {
    expect(readSessionRecap({ lastRecap: { text: 7, time: 10, scope: "turn" } })).toBeNull()
  })

  test("rejects a time that is missing, non-finite, or not positive", () => {
    expect(readSessionRecap({ lastRecap: { text: "Done", scope: "turn" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: "10", scope: "turn" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: Number.NaN, scope: "turn" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: Number.POSITIVE_INFINITY, scope: "turn" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: 0, scope: "turn" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: -1, scope: "turn" } })).toBeNull()
  })

  test("rejects a scope that is present but unknown", () => {
    expect(readSessionRecap({ lastRecap: { text: "Done", time: 10, scope: "session" } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: 10, scope: null } })).toBeNull()
    expect(readSessionRecap({ lastRecap: { text: "Done", time: 10, scope: 1 } })).toBeNull()
  })
})

describe("isRecapStale", () => {
  test("is fresh when the session has not moved past the recap", () => {
    expect(isRecapStale(recap(), recap().time)).toBe(false)
    expect(isRecapStale(recap(), recap().time - 60_000)).toBe(false)
  })

  test("tolerates skew inside the default five-second window", () => {
    expect(isRecapStale(recap(), recap().time + 5_000)).toBe(false)
    expect(isRecapStale(recap(), recap().time + 5_001)).toBe(true)
  })

  test("honors a custom tolerance", () => {
    expect(isRecapStale(recap(), recap().time + 30_000, 60_000)).toBe(false)
    expect(isRecapStale(recap(), recap().time + 60_001, 60_000)).toBe(true)
  })

  test("is not stale without a usable session update time", () => {
    expect(isRecapStale(recap(), null)).toBe(false)
    expect(isRecapStale(recap(), undefined)).toBe(false)
    expect(isRecapStale(recap(), Number.NaN)).toBe(false)
    expect(isRecapStale(recap(), Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe("requestSessionRecap", () => {
  const recapRequest = vi.fn()

  const stubClient = (accessor: "getSdkClient" | "getScopedSdkClient" = "getSdkClient") => {
    vi.spyOn(axCodeClient, accessor).mockReturnValue({ session: { recap: recapRequest } } as never)
  }

  afterEach(() => {
    recapRequest.mockReset()
    vi.restoreAllMocks()
  })

  test("returns the recap text stamped with the request time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    recapRequest.mockResolvedValue({ data: { text: "  Shipped the retry fix  " } })
    stubClient()

    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toEqual({
      text: "Shipped the retry fix",
      time: 1_000_000,
      scope: "conversation",
    })
    expect(recapRequest).toHaveBeenCalledWith(
      { sessionID: "ses_1", directory: undefined, scope: "conversation" },
      { signal: undefined },
    )
  })

  test("passes the requested scope and directory, scoping the client too", async () => {
    const controller = new AbortController()
    recapRequest.mockResolvedValue({ data: { text: "Conversation recap" } })
    stubClient("getScopedSdkClient")

    await requestSessionRecap({
      sessionId: " ses_1 ",
      directory: " /repo/project ",
      scope: "turn",
      signal: controller.signal,
    })

    expect(axCodeClient.getScopedSdkClient).toHaveBeenCalledWith("/repo/project")
    expect(recapRequest).toHaveBeenCalledWith(
      { sessionID: "ses_1", directory: "/repo/project", scope: "turn" },
      { signal: controller.signal },
    )
  })

  test("returns null when the runtime has no recap", async () => {
    recapRequest.mockResolvedValue({ data: { text: null } })
    stubClient()
    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toBeNull()

    recapRequest.mockResolvedValue({ data: null })
    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toBeNull()

    recapRequest.mockResolvedValue({ data: { text: "   " } })
    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toBeNull()
  })

  test("swallows an error envelope", async () => {
    recapRequest.mockResolvedValue({ error: { message: "unavailable" } })
    stubClient()
    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toBeNull()
  })

  test("swallows a transport failure and an abort", async () => {
    recapRequest.mockRejectedValue(new Error("connection reset"))
    stubClient()
    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toBeNull()

    recapRequest.mockRejectedValue(new DOMException("aborted", "AbortError"))
    await expect(requestSessionRecap({ sessionId: "ses_1" })).resolves.toBeNull()
  })

  test("returns null for a blank session id without calling the runtime", async () => {
    stubClient()
    await expect(requestSessionRecap({ sessionId: "   " })).resolves.toBeNull()
    expect(recapRequest).not.toHaveBeenCalled()
  })
})
