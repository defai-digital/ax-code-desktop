import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const dialog = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "DirectoryExplorerDialog.tsx"),
  "utf8",
)

describe("add project directory browser", () => {
  // Regression: with ~/code added as a project, the "code" row was disabled, so its repositories
  // could not be reached and only ~/code itself could ever be a project.
  test("a folder that is already a project stays browsable", () => {
    expect(dialog).toContain("added: Boolean(normalized && addedProjectPaths.has(normalized))")
    expect(dialog).not.toMatch(/row\.disabled/)
    expect(dialog).not.toContain('disabled={row.type === "directory"')
    expect(dialog).not.toContain("cursor-not-allowed opacity-45")
    // Enter / click on any directory row navigates into it.
    expect(dialog).toMatch(/const executeRow = React\.useCallback\([\s\S]*?browseToEntry\(row\)/)
    expect(dialog).toContain("const hasHighlightedBrowseItem = Boolean(highlightedRow)")
  })

  test("an added folder shows the Added badge instead of quick add", () => {
    expect(dialog).toMatch(/row\.type === "directory" && row\.added \? \([\s\S]*?browse\.addedBadge/)
  })
})
