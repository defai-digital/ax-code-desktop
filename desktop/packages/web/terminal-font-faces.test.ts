import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import {
  BUNDLED_TERMINAL_SYMBOL_FONT,
  PACKAGED_FONT_SRC_ALLOWLIST,
  WEB_SERVER_FONT_SRC_ALLOWLIST,
  buildTerminalFontSrc,
  collectFontUrls,
  fontUrlCoveredByFontSrc,
  renderTerminalFontSources,
} from "./terminal-font-faces"

describe("terminal font sources", () => {
  test("points both terminal families at the bundled symbol font without a CDN", () => {
    const fixture = `<style>
      @font-face {
        font-family: "JetBrainsMono Nerd Font";
        src: url("https://cdn.jsdelivr.net/font.woff2");
        unicode-range: U+E000-F8FF, U+F0000-FFFFF;
      }
      @font-face {
        font-family: "FiraCode Nerd Font";
        src: local("Old font");
        unicode-range: U+E000-F8FF, U+F0000-FFFFF;
      }
    </style>`
    const rendered = renderTerminalFontSources(fixture)
    const sources = [...rendered.matchAll(/src:\s*([^;]+);/g)].map((match) => match[1])
    expect(sources).toEqual([
      buildTerminalFontSrc("JetBrainsMono Nerd Font"),
      buildTerminalFontSrc("FiraCode Nerd Font"),
    ])
    expect(rendered).not.toContain("jsdelivr")
    expect(rendered).toContain(`url("${BUNDLED_TERMINAL_SYMBOL_FONT}")`)
    expect(rendered.match(/unicode-range: U\+E000-F8FF, U\+F0000-FFFFF/g)).toHaveLength(2)
    expect(renderTerminalFontSources(rendered)).toBe(rendered)
  })

  test("rejects unsupported families and preserves unrelated HTML", () => {
    expect(() => buildTerminalFontSrc("untrusted font")).toThrow("Unknown terminal font")
    const fixture = '<style>@font-face { font-family: "UI font"; src: local("UI font"); }</style>'
    expect(renderTerminalFontSources(fixture)).toBe(fixture)
  })

  test("covers every index.html font URL with the packaged and web font-src allowlists", () => {
    const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
    const rendered = renderTerminalFontSources(html)
    const urls = collectFontUrls(rendered)

    expect(urls).toEqual([BUNDLED_TERMINAL_SYMBOL_FONT, BUNDLED_TERMINAL_SYMBOL_FONT])
    for (const url of urls) {
      expect(fontUrlCoveredByFontSrc(url, PACKAGED_FONT_SRC_ALLOWLIST)).toBe(true)
      expect(fontUrlCoveredByFontSrc(url, WEB_SERVER_FONT_SRC_ALLOWLIST)).toBe(true)
    }
    expect(rendered).toContain('font-family: "JetBrainsMono Nerd Font"')
    expect(rendered).toContain('font-family: "FiraCode Nerd Font"')
    expect(rendered).not.toContain("jsdelivr")
    expect(rendered).not.toContain("cdn.jsdelivr.net")
    expect(renderTerminalFontSources(rendered)).toBe(rendered)

    expect(fontUrlCoveredByFontSrc("https://cdn.jsdelivr.net/npm/font.woff2", PACKAGED_FONT_SRC_ALLOWLIST)).toBe(false)
    expect(fontUrlCoveredByFontSrc("//cdn.jsdelivr.net/font.woff2", PACKAGED_FONT_SRC_ALLOWLIST)).toBe(false)
    expect(fontUrlCoveredByFontSrc(`app://ax-code${BUNDLED_TERMINAL_SYMBOL_FONT}`, PACKAGED_FONT_SRC_ALLOWLIST)).toBe(
      true,
    )
    expect(fontUrlCoveredByFontSrc(`app://ax-code${BUNDLED_TERMINAL_SYMBOL_FONT}`, WEB_SERVER_FONT_SRC_ALLOWLIST)).toBe(
      false,
    )

    const bytes = readFileSync(new URL(`./public${BUNDLED_TERMINAL_SYMBOL_FONT}`, import.meta.url))
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("wOF2")
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
