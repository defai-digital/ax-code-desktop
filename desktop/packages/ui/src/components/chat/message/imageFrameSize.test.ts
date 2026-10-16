import { describe, expect, test } from "vitest"
import { fitImageToFrame, naturalSizeForUrl } from "./imageFrameSize"

const measured = (url: string, width = 400, height = 200) => ({ url, width, height })

describe("naturalSizeForUrl", () => {
  test("only applies a measurement to the image it was read from", () => {
    // An image the browser has cached fires load before a reset effect commits, so a measurement
    // without its URL (or with a cleared one) left the frame at the whole viewport, with margins
    // around the picture that swallowed the click that closes it.
    expect(naturalSizeForUrl(measured("https://x/a.png"), "https://x/a.png")).toEqual(measured("https://x/a.png"))
    expect(naturalSizeForUrl(measured("https://x/a.png"), "https://x/b.png")).toBeNull()
    expect(naturalSizeForUrl(measured("https://x/a.png"), undefined)).toBeNull()
    expect(naturalSizeForUrl(null, "https://x/a.png")).toBeNull()
  })
})

describe("fitImageToFrame", () => {
  test("scales the image down to the frame and keeps its ratio", () => {
    expect(fitImageToFrame(measured("u", 400, 200), { maxWidth: 200, maxHeight: 200 })).toEqual({
      width: 200,
      height: 100,
    })
  })

  test("fills the frame while the image has not been measured", () => {
    expect(fitImageToFrame(null, { maxWidth: 300, maxHeight: 220 })).toEqual({ width: 300, height: 220 })
  })
})
