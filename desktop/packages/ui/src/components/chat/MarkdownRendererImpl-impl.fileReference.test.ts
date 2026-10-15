import { afterEach, describe, expect, test, vi } from "vitest"

const { fileReferenceExists } = await import("./markdownFileReferences")

const UNIQUE = (n: number) => `/repo/notes/missing-${n}.md`

describe("fileReferenceExists stat cache", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test("re-stats a path after a missing verdict expires", async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => ({ ok: false }))
    vi.stubGlobal("fetch", fetchMock)

    const path = UNIQUE(1)
    await expect(fileReferenceExists(path)).resolves.toBe(false)
    await expect(fileReferenceExists(path)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)

    await expect(fileReferenceExists(path)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("keeps a hit cached across the window", async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    const path = UNIQUE(2)
    await expect(fileReferenceExists(path)).resolves.toBe(true)

    await vi.advanceTimersByTimeAsync(60_000)

    await expect(fileReferenceExists(path)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("retries a failed stat instead of holding the failure", async () => {
    vi.useFakeTimers()
    fetchMock = vi.fn(async () => {
      throw new Error("network down")
    })
    vi.stubGlobal("fetch", fetchMock)

    const path = UNIQUE(3)
    await expect(fileReferenceExists(path)).resolves.toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)

    await expect(fileReferenceExists(path)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
