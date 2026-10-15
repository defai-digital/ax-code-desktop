import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { ICON_VIEWBOX, iconSpriteData } from "./sprite"

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..")

describe("icon sprite", () => {
  test("sprite.ts matches the Phosphor map", () => {
    const result = spawnSync(process.execPath, ["scripts/generate-icon-sprite.mjs", "--check"], {
      cwd: desktopRoot,
      encoding: "utf8",
    })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  })

  test("every glyph is a currentColor path group on the Phosphor grid", () => {
    expect(ICON_VIEWBOX).toBe("0 0 256 256")
    const entries = Object.entries(iconSpriteData)
    expect(entries.length).toBeGreaterThan(200)
    for (const [name, content] of entries) {
      expect(content, name).toMatch(/^<g fill="currentColor"( transform="[^"]+")?>/)
      // Button CSS forces rect and circle fills to none; only paths survive it.
      expect(content.replace(/<\/?(g|path)\b[^>]*>/g, ""), name).toBe("")
    }
  })
})
