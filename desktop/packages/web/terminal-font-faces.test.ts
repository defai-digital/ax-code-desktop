import { describe, expect, test } from "vitest"
import { buildTerminalFontSrc, renderTerminalFontSources } from "./terminal-font-faces"

describe("terminal font sources", () => {
  test("generates local fallbacks for both terminal families without fetching a CDN", () => {
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
    expect(sources).toEqual(['local("JetBrainsMono Nerd Font")', 'local("FiraCode Nerd Font")'])
    expect(rendered).not.toContain("jsdelivr")
    expect(rendered.match(/unicode-range: U\+E000-F8FF, U\+F0000-FFFFF/g)).toHaveLength(2)
    expect(renderTerminalFontSources(rendered)).toBe(rendered)
  })

  test("rejects unsupported families and preserves unrelated HTML", () => {
    expect(() => buildTerminalFontSrc("untrusted font")).toThrow("Unknown terminal font")
    const fixture = '<style>@font-face { font-family: "UI font"; src: local("UI font"); }</style>'
    expect(renderTerminalFontSources(fixture)).toBe(fixture)
  })
})
