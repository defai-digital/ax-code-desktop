import type { Theme, ThemeColor } from "@/types/theme"
import { contrastRatio, hexToOklch, oklchToHex, withAlpha, type Oklch } from "./oklch"

export interface GenerateThemeOptions {
  id: string
  name: string
  variant: "light" | "dark"
  /** Hex seed that donates the neutral hue. */
  base: string
  /** Hex seed that donates the primary/accent hue and chroma. */
  accent: string
  /** 0..1 strength knob for borders and surface spread. */
  contrast?: number
}

interface ToneSpec {
  hue: number
  chroma: number
  darkLightness: number
  lightLightness: number
}

// Fixed status hues per the Linear-style model: brand colors come from seeds,
// semantic colors stay at stable hues so meaning never shifts with the palette.
const STATUS_SPECS: Record<"error" | "warning" | "success" | "info", ToneSpec> = {
  error: { hue: 27, chroma: 0.2, darkLightness: 0.62, lightLightness: 0.58 },
  warning: { hue: 85, chroma: 0.17, darkLightness: 0.82, lightLightness: 0.76 },
  success: { hue: 150, chroma: 0.17, darkLightness: 0.7, lightLightness: 0.55 },
  info: { hue: 260, chroma: 0.18, darkLightness: 0.72, lightLightness: 0.55 },
}

const SYNTAX_SPECS: Record<"keyword" | "string" | "number" | "function" | "variable" | "type", ToneSpec> = {
  keyword: { hue: 5, chroma: 0.16, darkLightness: 0.7, lightLightness: 0.5 },
  string: { hue: 145, chroma: 0.15, darkLightness: 0.78, lightLightness: 0.55 },
  number: { hue: 80, chroma: 0.16, darkLightness: 0.8, lightLightness: 0.65 },
  function: { hue: 300, chroma: 0.15, darkLightness: 0.75, lightLightness: 0.52 },
  variable: { hue: 260, chroma: 0.16, darkLightness: 0.75, lightLightness: 0.52 },
  type: { hue: 175, chroma: 0.13, darkLightness: 0.77, lightLightness: 0.55 },
}

// Product-standard typography/transition config shared by the bundled themes.
const DEFAULT_CONFIG: Theme["config"] = {
  fonts: {
    sans: '"IBM Plex Sans", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", "Menlo", monospace',
    heading: '"IBM Plex Sans", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  transitions: {
    fast: "150ms ease",
    normal: "250ms ease",
    slow: "350ms ease",
  },
}

// Nudge lightness in one direction until the WCAG ratio against `background`
// clears `target`. Deterministic and bounded so generation stays pure.
function ensureContrast(
  color: Oklch,
  background: string | ((hex: string) => string[]),
  target: number,
  direction: 1 | -1,
  backdrop?: string,
): string {
  let candidate = { ...color }
  for (let step = 0; step < 100; step++) {
    const hex = oklchToHex(candidate)
    const backgrounds = typeof background === "string" ? [background] : background(hex)
    if (backgrounds.every((bg) => contrastRatio(hex, bg, backdrop) >= target)) {
      return hex
    }
    const next = Math.max(0, Math.min(1, candidate.l + direction * 0.01))
    if (next === candidate.l) {
      return hex
    }
    candidate = { ...candidate, l: next }
  }
  return oklchToHex(candidate)
}

interface ReadablePair {
  base: string
  foreground: string
  lightness: number
}

// Pick white or near-black text for a base color; when neither reads, push the
// base lightness away from mid-tones (dark themes brighten the base, light
// themes deepen it), which strictly improves the better pairing.
function readablePair(start: Oklch, variant: "light" | "dark", target: number): ReadablePair {
  let color = { ...start }
  const shift = variant === "dark" ? 0.02 : -0.02
  for (let step = 0; step <= 20; step++) {
    const base = oklchToHex(color)
    const whiteRatio = contrastRatio("#ffffff", base)
    const darkRatio = contrastRatio("#111111", base)
    if (Math.max(whiteRatio, darkRatio) >= target) {
      return { base, foreground: whiteRatio >= darkRatio ? "#ffffff" : "#111111", lightness: color.l }
    }
    const next = color.l + shift
    if (next < 0 || next > 1) {
      return {
        base,
        foreground: whiteRatio >= darkRatio ? "#ffffff" : "#111111",
        lightness: color.l,
      }
    }
    color = { ...color, l: next }
  }
  const base = oklchToHex(color)
  return {
    base,
    foreground: contrastRatio("#ffffff", base) >= contrastRatio("#111111", base) ? "#ffffff" : "#111111",
    lightness: color.l,
  }
}

function buildThemeColor(pair: ReadablePair, variant: "light" | "dark"): ThemeColor {
  // Dark primaries brighten on interaction, light primaries deepen — the same
  // ladder the AutomatosX pair uses.
  const step = variant === "dark" ? 0.035 : -0.035
  const shifted = (lightnessStep: number) =>
    oklchToHex({ ...hexToOklch(pair.base), l: Math.min(1, Math.max(0, pair.lightness + lightnessStep)) })
  return {
    base: pair.base,
    hover: shifted(step),
    active: shifted(step * 2),
    foreground: pair.foreground,
    muted: withAlpha(pair.base, 0.5),
    emphasis: shifted(step * 2),
  }
}

export function generateTheme(options: GenerateThemeOptions): Theme {
  const { id, name, variant, base, accent } = options
  const contrast = Math.min(1, Math.max(0, options.contrast ?? 0.5))
  const isDark = variant === "dark"

  const baseColor = hexToOklch(base)
  const accentColor = hexToOklch(accent)
  const hue = baseColor.h

  const neutralChroma = Math.min(0.018, Math.max(0.004, baseColor.c * 0.03))
  const neutral = (lightness: number) => oklchToHex({ l: lightness, c: neutralChroma, h: hue })

  // Surface ladder: dark canvases are the darkest step, light canvases the
  // lightest, with muted/elevated/subtle stepping away from the canvas.
  const canvasLightness = isDark ? 0.2 - 0.06 * contrast : 0.945 + 0.03 * contrast
  const mutedLightness = isDark ? canvasLightness + 0.03 : canvasLightness - 0.025
  const elevatedLightness = isDark ? canvasLightness + 0.065 : Math.min(1, canvasLightness + 0.025)
  const subtleLightness = isDark ? canvasLightness + 0.1 : canvasLightness - 0.05

  const background = neutral(canvasLightness)
  const muted = neutral(mutedLightness)
  const elevated = neutral(elevatedLightness)
  const subtle = neutral(subtleLightness)

  const foreground = ensureContrast({ l: isDark ? 0.92 : 0.22, c: 0.008, h: hue }, background, 4.8, isDark ? 1 : -1)
  const mutedForeground = ensureContrast(
    { l: isDark ? canvasLightness + 0.42 : 0.48, c: neutralChroma * 1.2, h: hue },
    background,
    3.2,
    isDark ? 1 : -1,
  )

  // Borders scale with the contrast input: the lightness step grows with the
  // knob and the audit floor rises with it too, so the measured ratio stays
  // monotonic in the input (a fixed floor would let nudged low-contrast
  // borders overtake natural high-contrast ones).
  const borderFloor = 1.35 + 0.2 * contrast
  const borderStep = 0.04 + 0.05 * contrast
  const border = ensureContrast(
    { l: isDark ? canvasLightness + borderStep : canvasLightness - borderStep, c: neutralChroma, h: hue },
    background,
    borderFloor,
    isDark ? 1 : -1,
  )
  const borderHover = ensureContrast(
    {
      l: isDark ? canvasLightness + borderStep + 0.03 : canvasLightness - borderStep - 0.03,
      c: neutralChroma,
      h: hue,
    },
    background,
    borderFloor + 0.1,
    isDark ? 1 : -1,
  )

  // Default buttons use primary text on a tint, including a stronger active
  // tint. Dark fills are translucent over the containing surface.
  const primaryBase = ensureContrast(
    { l: isDark ? 0.68 : 0.55, c: Math.min(0.26, accentColor.c), h: accentColor.h },
    (hex) => [background, withAlpha(hex, isDark ? 0.3 : 0.22)],
    4.6,
    isDark ? 1 : -1,
    isDark ? elevated : background,
  )
  const primaryPair = readablePair(hexToOklch(primaryBase), variant, 4.6)
  const primary = buildThemeColor(primaryPair, variant)

  const readableTone = (color: Oklch) =>
    ensureContrast(
      color,
      (hex) => [background, muted, withAlpha(hex, 0.2)],
      4.6,
      isDark ? 1 : -1,
      isDark ? elevated : muted,
    )

  const buildStatus = (spec: ToneSpec) =>
    readablePair(
      hexToOklch(readableTone({ l: isDark ? spec.darkLightness : spec.lightLightness, c: spec.chroma, h: spec.hue })),
      variant,
      4.6,
    )

  const error = buildStatus(STATUS_SPECS.error)
  const warning = buildStatus(STATUS_SPECS.warning)
  const success = buildStatus(STATUS_SPECS.success)
  const info = buildStatus(STATUS_SPECS.info)

  const syntaxTone = (spec: ToneSpec) =>
    readableTone({ l: isDark ? spec.darkLightness : spec.lightLightness, c: spec.chroma, h: spec.hue })

  const keyword = syntaxTone(SYNTAX_SPECS.keyword)
  const string = syntaxTone(SYNTAX_SPECS.string)
  const number = syntaxTone(SYNTAX_SPECS.number)
  const syntaxFunction = syntaxTone(SYNTAX_SPECS.function)
  const variable = syntaxTone(SYNTAX_SPECS.variable)
  const typeColor = syntaxTone(SYNTAX_SPECS.type)

  const syntaxComment = readableTone(hexToOklch(mutedForeground))
  const faintLineNumber = readableTone(hexToOklch(neutral(isDark ? canvasLightness + 0.2 : canvasLightness - 0.2)))

  const theme: Theme = {
    metadata: {
      id,
      name,
      description: `${name} — generated ${variant} theme (base ${base}, accent ${accent}, contrast ${contrast.toFixed(2)})`,
      version: "1.0.0",
      variant,
      tags: [variant, "generated"],
    },
    colors: {
      primary,
      surface: {
        background,
        foreground,
        muted,
        mutedForeground,
        elevated,
        elevatedForeground: foreground,
        overlay: isDark ? "#00000099" : "#00000040",
        subtle,
      },
      interactive: {
        border,
        borderHover,
        borderFocus: primary.base,
        selection: withAlpha(primary.base, 0.18),
        selectionForeground: foreground,
        focus: primary.base,
        focusRing: primary.base,
        cursor: foreground,
        hover: isDark ? withAlpha("#ffffff", 0.08) : withAlpha("#000000", 0.06),
        active: isDark ? withAlpha("#ffffff", 0.12) : withAlpha("#000000", 0.09),
      },
      status: {
        error: error.base,
        errorForeground: error.foreground,
        errorBackground: withAlpha(error.base, 0.15),
        errorBorder: withAlpha(error.base, 0.3),

        warning: warning.base,
        warningForeground: warning.foreground,
        warningBackground: withAlpha(warning.base, 0.15),
        warningBorder: withAlpha(warning.base, 0.3),

        success: success.base,
        successForeground: success.foreground,
        successBackground: withAlpha(success.base, 0.15),
        successBorder: withAlpha(success.base, 0.3),

        info: info.base,
        infoForeground: info.foreground,
        infoBackground: withAlpha(info.base, 0.15),
        infoBorder: withAlpha(info.base, 0.3),
      },
      pr: {
        open: success.base,
        draft: mutedForeground,
        blocked: warning.base,
        merged: isDark ? "#8957e5" : "#8250df",
        closed: error.base,
      },
      syntax: {
        base: {
          background: muted,
          foreground,
          comment: syntaxComment,
          keyword,
          string,
          number,
          function: syntaxFunction,
          variable,
          type: typeColor,
          operator: keyword,
        },
        tokens: {
          commentDoc: syntaxComment,
          stringEscape: typeColor,
          keywordImport: keyword,
          storageModifier: variable,
          functionCall: syntaxFunction,
          method: syntaxFunction,
          variableProperty: variable,
          variableOther: foreground,
          variableGlobal: keyword,
          variableLocal: foreground,
          parameter: foreground,
          constant: number,
          class: typeColor,
          className: typeColor,
          interface: typeColor,
          struct: typeColor,
          enum: typeColor,
          typeParameter: typeColor,
          namespace: typeColor,
          module: keyword,
          tag: variable,
          jsxTag: variable,
          tagAttribute: syntaxFunction,
          tagAttributeValue: string,
          boolean: number,
          decorator: number,
          label: keyword,
          punctuation: syntaxComment,
          macro: syntaxFunction,
          preprocessor: number,
          regex: typeColor,
          url: variable,
          key: variable,
          exception: error.base,
        },
        highlights: {
          diffAdded: string,
          diffAddedBackground: withAlpha(string, 0.18),
          diffRemoved: error.base,
          diffRemovedBackground: withAlpha(error.base, 0.18),
          diffModified: variable,
          diffModifiedBackground: withAlpha(variable, 0.15),
          lineNumber: faintLineNumber,
          lineNumberActive: foreground,
        },
      },
      markdown: {
        heading1: primary.base,
        heading2: foreground,
        heading3: mutedForeground,
        heading4: mutedForeground,
        link: variable,
        linkHover: oklchToHex({ ...hexToOklch(variable), l: Math.max(0, hexToOklch(variable).l - 0.06) }),
        inlineCode: syntaxFunction,
        inlineCodeBackground: muted,
        blockquote: mutedForeground,
        blockquoteBorder: border,
        listMarker: withAlpha(variable, 0.6),
      },
      chat: {
        userMessage: foreground,
        userMessageBackground: oklchToHex({
          l: isDark ? canvasLightness + 0.02 : canvasLightness - 0.03,
          c: Math.min(0.03, accentColor.c * 0.15),
          h: accentColor.h,
        }),
        assistantMessage: foreground,
        assistantMessageBackground: background,
        timestamp: mutedForeground,
        divider: border,
      },
      tools: {
        background: withAlpha(muted, 0.5),
        border: withAlpha(border, 0.6),
        headerHover: withAlpha(subtle, 0.5),
        icon: mutedForeground,
        title: foreground,
        description: mutedForeground,
        edit: {
          added: success.base,
          addedBackground: withAlpha(success.base, 0.15),
          removed: error.base,
          removedBackground: withAlpha(error.base, 0.15),
          lineNumber: faintLineNumber,
        },
      },
    },
    config: DEFAULT_CONFIG,
  }

  // Code tokens also appear on diff tints. Resolve alpha over the actual
  // editor backdrop, then adjust every text token without changing its hue.
  const syntax = theme.colors.syntax
  const codeBackgrounds = [background, syntax.base.background]
  const diffBackgrounds = Object.entries(syntax.highlights ?? {})
    .filter(([key]) => key.endsWith("Background"))
    .map(([, color]) => color)
  for (const tokens of [syntax.base, syntax.tokens ?? {}, syntax.highlights ?? {}]) {
    for (const [key, color] of Object.entries(tokens)) {
      if (key === "background" || key.endsWith("Background")) continue
      let readable = color
      for (const backdrop of codeBackgrounds) {
        readable = ensureContrast(
          hexToOklch(readable),
          () => [backdrop, ...diffBackgrounds],
          4.6,
          isDark ? 1 : -1,
          backdrop,
        )
      }
      Object.assign(tokens, { [key]: readable })
    }
  }

  return theme
}
