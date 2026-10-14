import { describe, expect, test } from "vitest"
import type { Theme } from "@/types/theme"
import { CSSVariableGenerator } from "@/lib/theme/cssGenerator"
import { contrastRatio } from "./oklch"
import { generateTheme } from "./generateTheme"
import { checkThemeContrast } from "./themeContrast"

const seeds = [
  { base: "#14161f", accent: "#52a8ff" },
  { base: "#101014", accent: "#46a758" },
  { base: "#2b1b17", accent: "#e5484d" },
  { base: "#f4f2ed", accent: "#b45309" },
  { base: "#f7f7f5", accent: "#2e7d43" },
]

const variants: Array<"light" | "dark"> = ["light", "dark"]

const hardFailures = (theme: Theme) => checkThemeContrast(theme).filter((failure) => failure.severity === "hard")

describe("generateTheme", () => {
  test("both variants of every seed clear the hard contrast rules", () => {
    for (const variant of variants) {
      for (const seed of seeds) {
        const theme = generateTheme({ id: `${variant}-seed`, name: "Seed", variant, ...seed })
        const failures = hardFailures(theme)
        expect(failures, `${variant} ${JSON.stringify(seed)}: ${JSON.stringify(failures)}`).toEqual([])
      }
    }
  })

  // No dedicated theme validator exists in src/lib/theme; CSSVariableGenerator
  // walks every required Theme field when emitting variables, so a clean run is
  // the package's structural acceptance check.
  test("generated themes pass the CSS variable generator end to end", () => {
    for (const variant of variants) {
      const theme = generateTheme({
        id: `css-${variant}`,
        name: "CSS walk",
        variant,
        base: "#14161f",
        accent: "#52a8ff",
      })
      const css = new CSSVariableGenerator().generate(theme)
      expect(css).toContain("--background:")
      expect(css).toContain("--primary-base:")
      expect(css).toContain("--status-error:")
      expect(css).toContain("--syntax-keyword:")
    }
  })

  test("metadata is echoed with generator provenance", () => {
    const theme = generateTheme({
      id: "custom-id",
      name: "Custom",
      variant: "dark",
      base: "#101014",
      accent: "#46a758",
    })
    expect(theme.metadata.id).toBe("custom-id")
    expect(theme.metadata.name).toBe("Custom")
    expect(theme.metadata.variant).toBe("dark")
    expect(theme.metadata.version).toBe("1.0.0")
    expect(theme.metadata.tags).toEqual(["dark", "generated"])
    expect(theme.metadata.description).toContain("#46a758")
  })

  test("generation is deterministic", () => {
    const options = { id: "stable", name: "Stable", variant: "light" as const, base: "#f4f2ed", accent: "#b45309" }
    expect(JSON.stringify(generateTheme(options))).toBe(JSON.stringify(generateTheme(options)))
  })

  test("contrast defaults to 0.5", () => {
    const explicit = generateTheme({
      id: "explicit",
      name: "Explicit",
      variant: "dark",
      base: "#101014",
      accent: "#46a758",
      contrast: 0.5,
    })
    const implicit = generateTheme({
      id: "implicit",
      name: "Implicit",
      variant: "dark",
      base: "#101014",
      accent: "#46a758",
    })
    // Only the id/name provenance differs; colors must be identical.
    expect(implicit.colors).toEqual(explicit.colors)
  })

  test("higher contrast input yields stronger borders", () => {
    const low = generateTheme({
      id: "low",
      name: "Low",
      variant: "dark",
      base: "#101014",
      accent: "#46a758",
      contrast: 0.1,
    })
    const high = generateTheme({
      id: "high",
      name: "High",
      variant: "dark",
      base: "#101014",
      accent: "#46a758",
      contrast: 1,
    })
    const lowRatio = contrastRatio(low.colors.interactive.border, low.colors.surface.background)
    const highRatio = contrastRatio(high.colors.interactive.border, high.colors.surface.background)
    expect(highRatio).toBeGreaterThanOrEqual(lowRatio)
  })

  test("rejects invalid seed colors", () => {
    expect(() =>
      generateTheme({ id: "bad", name: "Bad", variant: "dark", base: "not-a-color", accent: "#46a758" }),
    ).toThrow()
    expect(() => generateTheme({ id: "bad", name: "Bad", variant: "dark", base: "#101014", accent: "blue" })).toThrow()
  })
})
