import { createRequire } from "node:module"
import { inflateSync } from "node:zlib"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const { createBadgePng, setDesktopBadgeCount } = require("./desktop-badge.js")

const fixture = (platform) => ({
  platform,
  count: 1,
  app: { setBadgeCount: vi.fn(() => true) },
  window: { isDestroyed: () => false, setOverlayIcon: vi.fn() },
  nativeImage: { createFromBuffer: vi.fn(() => ({ native: true })) },
})

describe("desktop badge", () => {
  test("paints and clears the Windows overlay without calling setBadgeCount", () => {
    const options = fixture("win32")
    expect(setDesktopBadgeCount(options)).toBe(true)
    expect(options.nativeImage.createFromBuffer).toHaveBeenCalledWith(expect.any(Buffer))
    expect(options.window.setOverlayIcon).toHaveBeenCalledWith({ native: true }, expect.stringContaining("1"))
    expect(setDesktopBadgeCount({ ...options, count: 0 })).toBe(true)
    expect(options.window.setOverlayIcon).toHaveBeenLastCalledWith(null, "")
    expect(options.app.setBadgeCount).not.toHaveBeenCalled()
  })

  test("returns false if the Windows window is unavailable", () => {
    const options = fixture("win32")
    expect(setDesktopBadgeCount({ ...options, window: null })).toBe(false)
    expect(setDesktopBadgeCount({ ...options, window: { isDestroyed: () => true } })).toBe(false)
    expect(options.app.setBadgeCount).not.toHaveBeenCalled()
  })

  test.each(["darwin", "linux"])("returns the native badge result on %s", (platform) => {
    const options = fixture(platform)
    expect(setDesktopBadgeCount(options)).toBe(true)
    options.app.setBadgeCount.mockReturnValue(false)
    expect(setDesktopBadgeCount(options)).toBe(false)
    expect(options.app.setBadgeCount).toHaveBeenCalledWith(1)
    expect(options.window.setOverlayIcon).not.toHaveBeenCalled()
  })

  test("generates a small RGBA PNG with opaque badge pixels and a transparent background", () => {
    const png = createBadgePng(1)
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(png.readUInt32BE(16)).toBe(32)
    expect(png.readUInt32BE(20)).toBe(32)
    expect(png[25]).toBe(6)
    const compressedLength = png.readUInt32BE(33)
    const pixels = inflateSync(png.subarray(41, 41 + compressedLength))
    expect(pixels[4]).toBe(0)
    expect(pixels[16 * 129 + 1 + 16 * 4 + 3]).toBe(255)
    expect(png.length).toBeLessThan(2048)
    expect(createBadgePng(99)).not.toEqual(png)
    expect(() => createBadgePng(100)).not.toThrow()
  })
})
