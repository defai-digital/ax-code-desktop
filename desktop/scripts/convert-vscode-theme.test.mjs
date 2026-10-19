import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"

const SCRIPT = path.resolve(import.meta.dirname, "convert-vscode-theme.cjs")

// Prettier-formatted like the committed presets.ts: double quotes, no semicolons.
const REGISTERED_PRESETS = `import type { Theme } from "@/types/theme"

import test_theme_dark_Raw from "./test-theme-dark.json"

export const presetThemes: Theme[] = [
  test_theme_dark_Raw as Theme,
].map((theme) => theme)
`

const THEME = {
  name: "Test Theme",
  type: "dark",
  colors: { "editor.background": "#101010", "editor.foreground": "#F0F0F0" },
}

const makeFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-convert-theme-"))
  const scriptsDir = path.join(root, "scripts")
  const themesDir = path.join(root, "packages", "ui", "src", "lib", "theme", "themes")
  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.mkdirSync(themesDir, { recursive: true })
  fs.copyFileSync(SCRIPT, path.join(scriptsDir, "convert-vscode-theme.cjs"))
  fs.writeFileSync(path.join(themesDir, "presets.ts"), REGISTERED_PRESETS)
  const themePath = path.join(root, "input.json")
  fs.writeFileSync(themePath, JSON.stringify(THEME))
  return {
    root,
    script: path.join(scriptsDir, "convert-vscode-theme.cjs"),
    presets: path.join(themesDir, "presets.ts"),
    themePath,
  }
}

describe("convert-vscode-theme registration", () => {
  test("does not duplicate an import that Prettier already reformatted", () => {
    const fixture = makeFixture()
    try {
      // The committed presets.ts uses double quotes and no semicolons. Comparing the
      // generated single-quoted import line missed it and appended a second binding.
      const result = spawnSync("node", [fixture.script, fixture.themePath], { encoding: "utf8" })

      expect(result.status).toBe(0)
      expect(result.stdout).toContain("Theme already registered")
      expect(fs.readFileSync(fixture.presets, "utf8")).toBe(REGISTERED_PRESETS)
      expect(fs.readFileSync(fixture.presets, "utf8").match(/from ["']\.\/test-theme-dark\.json["']/g)).toHaveLength(1)
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})
