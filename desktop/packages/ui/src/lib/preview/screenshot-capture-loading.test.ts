import { afterEach, expect, test, vi } from "vitest"

afterEach(() => {
  vi.doUnmock("@zumer/snapdom")
  vi.doUnmock("html-to-image")
  vi.resetModules()
})

test("preview metadata remains usable without loading screenshot engines", async () => {
  vi.resetModules()
  const snapdom = vi.fn(() => {
    throw new Error("Screenshot engine loaded before a capture request")
  })
  const htmlToImage = vi.fn(() => {
    throw new Error("Screenshot fallback loaded before a capture request")
  })
  vi.doMock("@zumer/snapdom", snapdom)
  vi.doMock("html-to-image", htmlToImage)
  const { isPreviewElementMetadata, getBrowserProxyTargetKey } = await import("./screenshot-capture")
  expect(isPreviewElementMetadata(null)).toBe(false)
  expect(getBrowserProxyTargetKey("http://localhost:3000/example")).toBeTruthy()
  expect(snapdom).not.toHaveBeenCalled()
  expect(htmlToImage).not.toHaveBeenCalled()
})
