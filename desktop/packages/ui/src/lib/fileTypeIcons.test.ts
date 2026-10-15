import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { getFileTypeIconHref } from "./fileTypeIcons"
import { FILE_TYPE_ICON_IDS } from "./fileTypeIconIds"

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

const iconName = (filePath: string): string => getFileTypeIconHref(filePath).split("#").pop() ?? ""

describe("file type icon sprite", () => {
  test("sprite.svg and fileTypeIconIds.ts match the source icons", () => {
    const result = spawnSync(process.execPath, ["scripts/generate-file-type-sprite.mjs", "--check"], {
      cwd: desktopRoot,
      encoding: "utf8",
    })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  })
})

describe("file type icon resolution", () => {
  test("prefers the extension icon when the language icon would be a different file type", () => {
    // `.svg`, `.mdx` and `.env` all have a language too (xml, markdown, bash), so
    // the language branch used to answer first and these entries never applied.
    expect(iconName("logo.svg")).toBe("svg")
    expect(iconName("page.mdx")).toBe("mdx")
    expect(iconName("config.env")).toBe("settings")
  })

  test("keeps the language icon for extensions the two maps agree on", () => {
    expect(iconName("data.yml")).toBe("yaml")
    expect(iconName("README.md")).toBe("markdown")
    expect(iconName("app.ts")).toBe("typescript")
  })

  test("only resolves names the sprite defines", () => {
    for (const filePath of ["logo.svg", "page.mdx", "config.env", ".env.local", "unknown.zzz"]) {
      expect(FILE_TYPE_ICON_IDS.has(iconName(filePath))).toBe(true)
    }
  })
})
