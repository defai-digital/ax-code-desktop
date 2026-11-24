import { afterEach, describe, expect, it, vi } from "vitest"

import { API_ENDPOINTS, HTTP_DEFAULTS } from "./constants"
import { createWebFilesAPI } from "./files"

const originalFetch = globalThis.fetch
const originalDocument = globalThis.document

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.document = originalDocument
  vi.restoreAllMocks()
})

describe("createWebFilesAPI", () => {
  it("passes outside-workspace authorization options when creating directories", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, path: "/tmp/project" })))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await createWebFilesAPI().createDirectory("/tmp/project", { allowOutsideWorkspace: true })

    expect(result).toEqual({ success: true, path: "/tmp/project" })
    expect(fetchMock).toHaveBeenCalledWith(API_ENDPOINTS.files.fsMkdir, {
      method: HTTP_DEFAULTS.method.post,
      headers: HTTP_DEFAULTS.headers.contentTypeJson,
      body: JSON.stringify({ path: "/tmp/project", allowOutsideWorkspace: true }),
    })
  })

  it("passes outside-workspace authorization options when downloading files", async () => {
    const click = vi.fn()
    const anchor = { href: "", download: "", click }
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    globalThis.document = {
      createElement: vi.fn(() => anchor),
      body: { appendChild, removeChild },
    } as unknown as Document

    await createWebFilesAPI().downloadFile?.("/tmp/approved/image.png", { allowOutsideWorkspace: true })

    expect(anchor.href).toBe("/api/fs/raw?path=%2Ftmp%2Fapproved%2Fimage.png&download=true&allowOutsideWorkspace=true")
    expect(anchor.download).toBe("image.png")
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalled()
    expect(removeChild).toHaveBeenCalledWith(anchor)
  })

  it("scopes a write to the workspace it names, and leaves other writes unscoped", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, path: "/repo/a.txt" })))
    globalThis.fetch = fetchMock as typeof fetch
    const api = createWebFilesAPI()

    await api.writeFile?.("/repo/a.txt", "alpha", { directory: "/repo dir" })
    await api.writeFile?.("/repo/a.txt", "alpha")

    const urls = fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])
    expect(urls).toEqual([`${API_ENDPOINTS.files.fsWrite}?directory=%2Frepo+dir`, API_ENDPOINTS.files.fsWrite])
  })

  it("scopes a read to the workspace it names", async () => {
    const fetchMock = vi.fn(async () => new Response("alpha"))
    globalThis.fetch = fetchMock as typeof fetch

    await createWebFilesAPI().readFile?.("/repo/a.txt", { directory: "/repo" })

    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0], "http://local")
    expect(url.pathname).toBe(API_ENDPOINTS.files.fsRead)
    expect(url.searchParams.get("path")).toBe("/repo/a.txt")
    expect(url.searchParams.get("directory")).toBe("/repo")
  })
})
