import { describe, expect, test } from "vitest"
import { CSSVariableGenerator } from "./cssGenerator"
import { generateTheme } from "./generateTheme"

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
})
