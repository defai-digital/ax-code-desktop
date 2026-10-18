import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: { getBaseUrl: () => "http://127.0.0.1:4096/api" },
}))

import { appendPromptHistory, listPromptHistory, promptHistoryHeaders, promptHistoryRequestUrl, resetPromptHistoryTransportForTests } from "./promptHistoryApi"

describe("prompt history requests", () => {
  beforeEach(() => {
    resetPromptHistoryTransportForTests()
    vi.unstubAllGlobals()
  })

  test("builds a directory-scoped list url and encodes non-ASCII header paths", () => {
    expect(promptHistoryRequestUrl("http://127.0.0.1:4096/api", "/work/alpha", 50)).toBe(
      "http://127.0.0.1:4096/api/prompt-history?directory=%2Fwork%2Falpha&limit=50",
    )
    expect(promptHistoryHeaders("/work/alpha")).toMatchObject({
      "x-ax-code-directory": "/work/alpha",
      "x-opencode-directory": "/work/alpha",
    })
    expect(promptHistoryHeaders("/工作/alpha")["x-ax-code-directory"]).toBe(encodeURIComponent("/工作/alpha"))
  })

  test("a failed or malformed list does not look like an empty history", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)
    expect(await listPromptHistory("/work/alpha")).toEqual({ ok: false })
    expect(await listPromptHistory("/work/alpha")).toEqual({ ok: false })
  })

  test("a list response keeps the stored rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ input: "fix tests", mode: "normal", parts: [] }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    expect(await listPromptHistory("/work/alpha")).toEqual({
      ok: true,
      entries: [{ input: "fix tests", mode: "normal", parts: [] }],
    })
  })

  test("appends for one directory run one at a time, and a failed write does not block the next", async () => {
    const bodies: string[] = []
    const releases: Array<(value: Response | PromiseRejectedResult["reason"]) => void> = []
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        bodies.push(String(init.body))
        return new Promise<Response>((resolve, reject) => {
          releases.push((value) => {
            if (value instanceof Error) reject(value)
            else resolve(value)
          })
        })
      }),
    )
    const first = appendPromptHistory("/work/alpha", { input: "first", mode: "normal", parts: [] })
    const second = appendPromptHistory("/work/alpha", { input: "second", mode: "shell", parts: [] })
    await Promise.resolve()
    expect(bodies).toHaveLength(1)
    releases[0]?.(new Error("offline"))
    await first
    await Promise.resolve()
    expect(bodies).toHaveLength(2)
    releases[1]?.(new Response(null, { status: 200 }))
    await second
    expect(bodies.map((body) => JSON.parse(body))).toEqual([
      { input: "first", mode: "normal", parts: [] },
      { input: "second", mode: "shell", parts: [] },
    ])
  })
})
