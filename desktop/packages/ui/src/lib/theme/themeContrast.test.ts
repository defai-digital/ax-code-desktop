import { describe, expect, test } from "vitest"
import type { Theme } from "@/types/theme"
import { checkThemeContrast } from "./themeContrast"
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
