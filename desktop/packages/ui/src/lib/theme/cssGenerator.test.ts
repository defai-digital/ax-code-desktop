import { describe, expect, test } from "vitest"
import { CSSVariableGenerator, isSafeCssLine } from "./cssGenerator"
import { generateTheme } from "./generateTheme"
import { themes } from "./themes"

describe("CSSVariableGenerator", () => {
  test("skips syntax token names that are not plain identifiers", () => {
    const theme = generateTheme({ id: "generated-t", name: "T", variant: "dark", base: "#14161f", accent: "#52a8ff" })
    theme.colors.syntax.tokens = {
      ...theme.colors.syntax.tokens,
      customKeyword: "#112233",
      "x}\nbody{background:red}x": "#000000",
    }

    const css = new CSSVariableGenerator().generate(theme)

    expect(css).toContain("--syntax-custom-keyword: #112233;")
    expect(css).not.toContain("background:red")
  })

  test("drops values that could close the declaration block", () => {
    const theme = generateTheme({ id: "generated-t", name: "T", variant: "dark", base: "#14161f", accent: "#52a8ff" })
    theme.colors.status.error = "#fff;} html{background:url(https://example.invalid/x)} :root{"
    theme.colors.status.warning = "#fff /* x */"

    const css = new CSSVariableGenerator().generate(theme)

    expect(css).not.toContain("example.invalid")
    expect(css).not.toContain("/* x */")
    expect(css).toContain("--status-success")
  })

  test("keeps every line generated for the bundled themes", () => {
    const generator = new CSSVariableGenerator()
    for (const theme of themes) {
      expect(generator.generateLines(theme).filter((line) => !isSafeCssLine(line)), theme.metadata.id).toEqual([])
    }
  })
})
