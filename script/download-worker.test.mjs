import { describe, it, expect } from "vitest"
import worker, { byteRange, objectKey } from "../.internal/deploy/download-worker/worker.mjs"

function environment(content = "abcdefghij") {
  const metadata = {
    size: content.length,
    etag: "hash",
    httpEtag: '"hash"',
    writeHttpMetadata: (headers) => headers.set("Content-Type", "application/octet-stream"),
  }
  return {
    PUBLIC_RELEASE_ENABLED: "true",
    DESKTOP_RELEASES: {
      head: async () => metadata,
      get: async (_key, options) => ({
        ...metadata,
        body: options.range
          ? content.slice(options.range.offset, options.range.offset + options.range.length)
          : content,
      }),
    },
  }
}
const request = (key = "install", options) =>
  new Request(`https://download.automatosx.com/ax-code-desktop/${key}`, options)

describe("Desktop download gateway", () => {
  it("isolates the Desktop namespace from CLI assets and encoded traversal", () => {
    expect(objectKey(new URL("https://download.automatosx.com/ax-code/install"))).toBeNull()
    expect(objectKey(new URL("https://download.automatosx.com/ax-code-desktop/%2fsecret"))).toBeNull()
    expect(objectKey(new URL("https://other.example/ax-code-desktop/install"))).toBeNull()
    expect(
      objectKey(
        new URL(
          "https://download.automatosx.com/ax-code-desktop/releases/download/v7.24.5/AX-Code-7.24.5-win-x64.exe.minisig",
        ),
      ),
    ).toContain("releases/download/")
  })
  it("keeps public serving disabled by default", async () => {
    const env = environment()
    delete env.PUBLIC_RELEASE_ENABLED
    expect((await worker.fetch(request(), env)).status).toBe(503)
  })
  it("rejects writes and missing objects without caching errors", async () => {
    expect((await worker.fetch(request("install", { method: "POST" }), environment())).status).toBe(405)
    const env = environment()
    env.DESKTOP_RELEASES.head = async () => null
    const response = await worker.fetch(request(), env)
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })
  it("serves HEAD, conditional requests and mutable aliases", async () => {
    const head = await worker.fetch(request("install", { method: "HEAD" }), environment())
    expect(await head.text()).toBe("")
    expect(head.headers.get("Content-Length")).toBe("10")
    expect(head.headers.get("Cache-Control")).toBe("no-store")
    expect(
      (await worker.fetch(request("install", { headers: { "If-None-Match": '"hash"' } }), environment())).status,
    ).toBe(304)
  })
  it("serves immutable artifacts with correct partial-content bytes", async () => {
    const response = await worker.fetch(
      request("releases/download/v7.24.5/test.zip", { headers: { Range: "bytes=2-5" } }),
      environment(),
    )
    expect(response.status).toBe(206)
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10")
    expect(response.headers.get("Content-Length")).toBe("4")
    expect(response.headers.get("Cache-Control")).toContain("immutable")
    expect(await response.text()).toBe("cdef")
  })
  it("handles suffix, unsatisfiable and If-Range mismatch requests", async () => {
    expect(byteRange("bytes=-3", 10)).toEqual({ offset: 7, length: 3 })
    expect(byteRange("bytes=-0", 10)).toBeNull()
    expect(byteRange("bytes=20-", 10)).toBeNull()
    expect((await worker.fetch(request("install", { headers: { Range: "bytes=20-" } }), environment())).status).toBe(
      416,
    )
    const response = await worker.fetch(
      request("install", { headers: { Range: "bytes=2-5", "If-Range": '"old"' } }),
      environment(),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("abcdefghij")
  })
  it("fails closed when mutable metadata and body belong to different revisions", async () => {
    const env = environment()
    env.DESKTOP_RELEASES.get = async () => ({ etag: "changed" })
    expect((await worker.fetch(request(), env)).status).toBe(503)
  })
})
