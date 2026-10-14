// Dependency-free color math shared by theme generation and contrast auditing.
// OKLab/OKLCH conversion uses Björn Ottosson's canonical matrices verbatim
// (https://bottosson.github.io/posts/oklab/) so values stay traceable.

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export interface Oklch {
  l: number
  c: number
  h: number
}

const HEX_PATTERN = /^#(?:([0-9a-fA-F]{3,4})|([0-9a-fA-F]{6})|([0-9a-fA-F]{8}))$/

export function parseHex(value: string): Rgba {
  const match = HEX_PATTERN.exec(value.trim())
  if (!match) {
    throw new Error(`Invalid hex color: "${value}" (expected #RGB, #RGBA, #RRGGBB or #RRGGBBAA)`)
  }

  const short = match[1]
  const digits = short
    ? short
        .split("")
        .map((char) => char + char)
        .join("")
    : (match[2] ?? match[3])

  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
    a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
  }
}

export function toHex(color: Rgba): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0")
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

export function withAlpha(hex: string, alpha: number): string {
  const alphaByte = Math.max(0, Math.min(255, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, "0")
  return `${toHex(parseHex(hex))}${alphaByte}`
}

const srgbToLinear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

const linearToSrgb = (value: number): number => {
  const v = Math.max(0, value)
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

export function hexToOklch(hex: string): Oklch {
  const { r, g, b } = parseHex(hex)
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.sqrt(a * a + b2 * b2)
  // Hue is meaningless for grays; pin it to 0 so round trips stay exact.
  const hue = chroma < 1e-8 ? 0 : ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360
  return { l: lightness, c: chroma, h: hue }
}

interface LinearRgb {
  r: number
  g: number
  b: number
}

function oklchToLinearRgb(color: Oklch): LinearRgb {
  const hueRad = (color.h * Math.PI) / 180
  const a = color.c * Math.cos(hueRad)
  const b = color.c * Math.sin(hueRad)

  const l = Math.pow(color.l + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(color.l - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(color.l - 0.0894841775 * a - 1.291485548 * b, 3)

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

const isInGamut = (color: Oklch): boolean => {
  const { r, g, b } = oklchToLinearRgb(color)
  const epsilon = 1e-6
  return r >= -epsilon && r <= 1 + epsilon && g >= -epsilon && g <= 1 + epsilon && b >= -epsilon && b <= 1 + epsilon
}

// Clamp an out-of-gamut color by binary-searching the largest chroma that fits
// sRGB. Chroma is the sacrificed axis because hue and lightness dominate
// perceived identity.
export function clampChroma(color: Oklch): Oklch {
  if (isInGamut(color)) {
    return { ...color }
  }
  let low = 0
  let high = color.c
  for (let iteration = 0; iteration < 24; iteration++) {
    const mid = (low + high) / 2
    if (isInGamut({ ...color, c: mid })) {
      low = mid
    } else {
      high = mid
    }
  }
  return { ...color, c: low }
}

export function oklchToHex(color: Oklch): string {
  const linear = oklchToLinearRgb(clampChroma(color))
  return toHex({
    r: linearToSrgb(linear.r) * 255,
    g: linearToSrgb(linear.g) * 255,
    b: linearToSrgb(linear.b) * 255,
    a: 1,
  })
}

// CSS simple alpha blending happens on gamma-encoded channels, so compositing
// before linearizing matches what the browser actually paints.
function compositeOver(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.a + background.a * (1 - foreground.a)
  if (alpha === 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }
  const blend = (fg: number, bg: number) => (foreground.a * fg + background.a * (1 - foreground.a) * bg) / alpha
  return {
    r: blend(foreground.r, background.r),
    g: blend(foreground.g, background.g),
    b: blend(foreground.b, background.b),
    a: alpha,
  }
}

const luminanceOfRgba = (color: Rgba): number =>
  0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)

// WCAG relative luminance. Alpha is composited over `background` (white by
// default, the CSS initial backdrop); a translucent background resolves
// against white first, as in contrastRatio.
export function relativeLuminance(hex: string, background = "#ffffff"): number {
  let color = parseHex(hex)
  if (color.a < 1) {
    let back = parseHex(background)
    if (back.a < 1) back = compositeOver(back, parseHex("#ffffff"))
    color = compositeOver(color, back)
  }
  return luminanceOfRgba(color)
}

// WCAG 2.x contrast ratio in [1, 21]. The foreground's alpha composites over
// the background; a translucent background resolves against white first.
export function contrastRatio(foreground: string, background: string): number {
  let back = parseHex(background)
  if (back.a < 1) {
    back = compositeOver(back, parseHex("#ffffff"))
  }
  const front = compositeOver(parseHex(foreground), back)

  const lighter = Math.max(luminanceOfRgba(front), luminanceOfRgba(back))
  const darker = Math.min(luminanceOfRgba(front), luminanceOfRgba(back))
  return (lighter + 0.05) / (darker + 0.05)
}
