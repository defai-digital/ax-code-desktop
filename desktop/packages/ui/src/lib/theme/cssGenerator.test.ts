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

  test("emits only valid hex colours for the bundled themes", () => {
    // Regression: appending an alpha byte to an 8-digit (or shorthand) hex produced a
    // ten-digit value that is not a colour, so the focus ring of the Vitesse themes
    // resolved to nothing.
    const generator = new CSSVariableGenerator()
    for (const theme of themes) {
      for (const line of generator.generateLines(theme)) {
        for (const match of line.matchAll(/#([0-9a-fA-F]+)/g)) {
          expect([3, 4, 6, 8], `${theme.metadata.id}: ${line.trim()}`).toContain(match[1].length)
        }
      }
      if (theme.metadata.id.startsWith("vitesse-")) {
        // The literal in these themes is semi-transparent black; it must survive as a
        // valid four-byte hex rather than the ten-digit value it replaced.
        expect(generator.generate(theme), theme.metadata.id).toContain("--interactive-focus-ring: #00000050")
      }
    }
  })
})
