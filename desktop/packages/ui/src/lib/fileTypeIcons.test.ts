import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")

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
