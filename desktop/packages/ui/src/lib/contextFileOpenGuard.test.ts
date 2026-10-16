import { describe, expect, test, vi } from "vitest"
import { validateContextFileOpen } from "./contextFileOpenGuard"

describe("validateContextFileOpen", () => {
  test("reads without the optional flag, so a missing file is an error and not an empty read", async () => {
    // `optional: true` tells the engine that an absent file is not a failure: a missing path then resolves with no
    // content, the line count of "" is 1, and the guard answered `{ ok: true }` for a file that is not there —
    // making its own "File not found" message unreachable.
    const readFile = vi.fn(async (_path: string, _options?: Record<string, unknown>) => ({ content: "" }))

    await validateContextFileOpen({ readFile } as never, "/nope.md")

    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile.mock.calls[0][1]).not.toHaveProperty("optional")
  })

  test("does not ask the fetch fallback for an optional read either", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response("", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    try {
      await validateContextFileOpen({} as never, "/nope.md")

      const url = String(fetchMock.mock.calls[0][0])
      expect(url).not.toContain("optional=")
      expect(url).toContain("allowOutsideWorkspace=true")
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test("still reports a read failure as missing", async () => {
    const files = {
      readFile: vi.fn(async () => {
        throw new Error("ENOENT: no such file or directory, open '/nope.md'")
      }),
    }

    await expect(validateContextFileOpen(files as never, "/nope.md")).resolves.toEqual({
      ok: false,
      reason: "missing",
    })
  })
})
