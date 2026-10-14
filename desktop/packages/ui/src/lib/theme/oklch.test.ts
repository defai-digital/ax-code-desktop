import { describe, expect, test } from "vitest"
import { clampChroma, contrastRatio, hexToOklch, oklchToHex, parseHex, relativeLuminance, withAlpha } from "./oklch"

describe("parseHex", () => {
  test("parses 3/4/6/8-digit forms", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    // 4-digit shorthand doubles each digit: #FFF8 expands to #FFFFFF88.
    expect(parseHex("#FFF8")).toEqual({ r: 255, g: 255, b: 255, a: 136 / 255 })
    expect(parseHex("#46A758")).toEqual({ r: 70, g: 167, b: 88, a: 1 })
    expect(parseHex("#46a75880")).toEqual({ r: 70, g: 167, b: 88, a: 128 / 255 })
  })

  test("rejects malformed colors", () => {
    expect(() => parseHex("#GGG")).toThrow()
    expect(() => parseHex("123456")).toThrow()
    expect(() => parseHex("#12345")).toThrow()
    expect(() => parseHex("#1234567")).toThrow()
    expect(() => parseHex("")).toThrow()
  })
})

describe("hex <-> OKLCH round trips", () => {
  test("in-gamut colors survive hex -> OKLCH -> hex exactly", () => {
    const colors = [
      "#000000",
      "#ffffff",
      "#0a0a0a",
      "#46a758",
      "#ededed",
      "#ffb224",
      "#52a8ff",
      "#2e7d43",
      "#8e4ec6",
      "#f2a700",
      "#0ac7ac",
      "#808080",
    ]
    for (const color of colors) {
      expect(oklchToHex(hexToOklch(color))).toBe(color)
    }
  })

  test("black maps to the OKLCH origin", () => {
    expect(hexToOklch("#000000")).toEqual({ l: 0, c: 0, h: 0 })
  })

  test("white maps to lightness 1 with zero chroma", () => {
    const white = hexToOklch("#ffffff")
    expect(white.l).toBeCloseTo(1, 6)
    expect(white.c).toBeCloseTo(0, 3)
  })

  // Reference values from Björn Ottosson's OKLab publication.
  test("sRGB red matches the published OKLCH values", () => {
    const red = hexToOklch("#ff0000")
    expect(red.l).toBeCloseTo(0.627955, 4)
    expect(red.c).toBeCloseTo(0.257683, 4)
    expect(red.h).toBeCloseTo(29.2338, 3)
  })
})

describe("gamut clamping", () => {
  test("leaves in-gamut colors untouched", () => {
    const green = hexToOklch("#46a758")
    const clamped = clampChroma(green)
    expect(clamped.l).toBeCloseTo(green.l, 12)
    expect(clamped.c).toBeCloseTo(green.c, 12)
    expect(clamped.h).toBeCloseTo(green.h, 12)
  })

  test("reduces chroma until the color fits sRGB", () => {
    const outOfGamut = { l: 0.6, c: 0.4, h: 30 }
    const clamped = clampChroma(outOfGamut)
    expect(clamped.c).toBeLessThan(outOfGamut.c)
    expect(clamped.l).toBeCloseTo(outOfGamut.l, 12)
    expect(clamped.h).toBeCloseTo(outOfGamut.h, 12)

    const hex = oklchToHex(outOfGamut)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    // Re-parsing the clamped hex must stay inside the original chroma budget.
    expect(hexToOklch(hex).c).toBeLessThanOrEqual(outOfGamut.c)
  })
})

describe("luminance and contrast", () => {
  test("relative luminance of black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 12)
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10)
  })

  test("black on white is the 21:1 maximum", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 8)
  })

  test("mid gray on black lands near the documented 4.69:1", () => {
    expect(contrastRatio("#777777", "#000000")).toBeCloseTo(4.69, 2)
  })

  test("contrast is symmetric in its arguments", () => {
    expect(contrastRatio("#777777", "#000000")).toBeCloseTo(contrastRatio("#000000", "#777777"), 12)
  })
})

describe("alpha handling", () => {
  test("withAlpha appends the alpha byte", () => {
    expect(withAlpha("#46a758", 128 / 255)).toBe("#46a75880")
    expect(withAlpha("#46a758", 1)).toBe("#46a758ff")
  })

  test("alpha composites over the background before measuring contrast", () => {
    // #ffffff at 80% over black is exactly #cccccc.
    expect(contrastRatio("#ffffffcc", "#000000")).toBeCloseTo(contrastRatio("#cccccc", "#000000"), 12)
    expect(contrastRatio("#ffffffcc", "#000000")).toBeCloseTo(13.08, 1)
  })

  test("opaque foreground ignores the background's own compositing path", () => {
    expect(contrastRatio("#ffffff", "#00000000")).toBeCloseTo(contrastRatio("#ffffff", "#ffffff"), 12)
  })

  test("relative luminance resolves a translucent background against white", () => {
    // 50% black over white is mid grey; black over that grey is still black.
    expect(relativeLuminance("#00000000", "#00000080")).toBeCloseTo(relativeLuminance("#808080"), 2)
  })
})
