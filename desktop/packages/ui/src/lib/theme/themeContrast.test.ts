import { describe, expect, test } from "vitest"
import type { Theme } from "@/types/theme"
import { checkGeneratedThemeContrast, checkThemeContrast } from "./themeContrast"
import { generateTheme } from "./generateTheme"
import { getThemeById, themes } from "./themes"

// Bundled themes that miss a hard rule can be listed here, with a reason,
// while they are fixed; the hygiene test below keeps the list honest. The ten
// light themes that paired pastel text with mid-tone primaries (e.g. aura-light
// #F5F0FF on #A277FF, 2.84:1) now darken their own text colour in OKLCH until
// it reads at 4.6:1 or better.
const KNOWN_FAILURES: string[] = []

const hardFailures = (theme: Theme) => checkThemeContrast(theme).filter((failure) => failure.severity === "hard")

describe("bundled theme contrast audit", () => {
  test("every bundled theme passes the hard contrast rules", () => {
    const offenders = themes
      .filter((theme) => !KNOWN_FAILURES.includes(theme.metadata.id))
      .map((theme) => ({ id: theme.metadata.id, failures: hardFailures(theme) }))
      .filter((entry) => entry.failures.length > 0)

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })

  test("known failures still genuinely fail (allowlist hygiene)", () => {
    const stale: string[] = []
    for (const id of KNOWN_FAILURES) {
      const theme = getThemeById(id)
      expect(theme, `unknown KNOWN_FAILURES id: ${id}`).toBeDefined()
      if (hardFailures(theme!).length === 0) {
        stale.push(id)
      }
    }
    expect(stale, `ids that no longer fail and should be removed: ${stale.join(", ")}`).toEqual([])
  })
})

describe("checkGeneratedThemeContrast", () => {
  const generated = () => generateTheme({
    id: "audit", name: "Audit", variant: "light", base: "#24262d", accent: "#6d75e8", contrast: 0.5,
  })

  test("detects unreadable status text on canvas and its own tint", () => {
    const theme = generated()
    theme.colors.status.warning = "#d9ac00"
    theme.colors.status.warningBackground = "#d9ac0026"
    const rules = checkGeneratedThemeContrast(theme).map((failure) => failure.rule)
    expect(rules).toContain("status.warning-on-background")
    expect(rules).toContain("status.warning-on-tint-background")
  })

  test("audits status foregrounds on solid status fills", () => {
    const theme = generated()
    theme.colors.status.successForeground = theme.colors.status.success
    expect(checkGeneratedThemeContrast(theme).map((failure) => failure.rule))
      .toContain("status.successForeground-on-success")
  })

  test("requires 4.5 for syntax numbers, comments, extra tokens, and line numbers", () => {
    const theme = generated()
    theme.colors.syntax.base.number = "#c5a500"
    theme.colors.syntax.base.comment = "#aaaaaa"
    theme.colors.syntax.tokens!.punctuation = "#aaaaaa"
    theme.colors.syntax.highlights!.lineNumber = "#aaaaaa"
    const failures = checkGeneratedThemeContrast(theme)
    for (const rule of [
      "syntax.base.number-on-syntax", "syntax.base.comment-on-syntax",
      "syntax.tokens.punctuation-on-syntax", "syntax.highlights.lineNumber-on-syntax",
    ]) {
      expect(failures.find((failure) => failure.rule === rule)).toMatchObject({ severity: "hard", required: 4.5 })
    }
  })

  test("detects tinted button text even when the solid primary pairing passes", () => {
    const theme = generated()
    theme.colors.primary.base = "#707070"
    theme.colors.primary.foreground = "#ffffff"
    expect(checkThemeContrast(theme).filter((failure) => failure.severity === "hard")).toEqual([])
    expect(checkGeneratedThemeContrast(theme).map((failure) => failure.rule))
      .toContain("button.primary-active-on-background")
  })

  test("composites dark button and status tints over their containing surfaces", () => {
    const theme = generateTheme({ id: "dark", name: "Dark", variant: "dark", base: "#24262d", accent: "#6d75e8" })
    expect(checkGeneratedThemeContrast(theme)).toEqual([])
    theme.colors.surface.elevated = "#eeeeee"
    expect(checkGeneratedThemeContrast(theme).map((failure) => failure.rule))
      .toContain("button.primary-default-on-elevated")
  })
})

describe("checkThemeContrast", () => {
  test("detects a broken surface foreground pairing", () => {
    const base = getThemeById("automatosx-dark")!
    const broken: Theme = {
      ...base,
      colors: {
        ...base.colors,
        surface: { ...base.colors.surface, foreground: base.colors.surface.background },
      },
    }
    const failure = checkThemeContrast(broken).find((f) => f.rule === "surface.foreground-on-background")
    expect(failure).toBeDefined()
    expect(failure!.severity).toBe("hard")
    expect(failure!.ratio).toBeLessThan(4.5)
    expect(failure!.required).toBe(4.5)
  })

  test("flags low-contrast primary text as a hard failure", () => {
    const base = getThemeById("automatosx-dark")!
    const broken: Theme = {
      ...base,
      colors: {
        ...base.colors,
        primary: { ...base.colors.primary, base: "#8e8e8e", foreground: "#eeeeee" },
      },
    }
    const failure = checkThemeContrast(broken).find((f) => f.rule === "primary.foreground-on-primary.base")
    expect(failure).toBeDefined()
    expect(failure!.severity).toBe("hard")
    expect(failure!.ratio).toBeLessThan(4.5)
  })

  test("returns no hard failures for the bundled default dark theme", () => {
    const theme = getThemeById("automatosx-dark")!
    expect(hardFailures(theme)).toEqual([])
  })
})
