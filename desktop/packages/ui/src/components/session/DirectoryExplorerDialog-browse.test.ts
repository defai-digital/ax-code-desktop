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

  test("quick add is a sibling of the row, not a button inside a button", () => {
    // A button inside a button is invalid HTML, and screen readers flatten the inner one into the outer control:
    // quick add was announced as the row itself and could not be reached on its own. The row reserves the room
    // (pr-8) and the quick add sits beside it.
    expect(dialog).toContain('<div key={row.value} className="relative">')
    expect(dialog).toMatch(/pl-2 pr-8 text-left/)
    expect(dialog).toMatch(
      /<\/button>\n\s+\{row\.type === "directory" && !row\.added \? \(\n\s+<button\n\s+type="button"\n\s+onClick=\{\(event\) => handleQuickAdd\(event, row\.path\)\}/,
    )
  })

  test("an added folder shows the Added badge instead of quick add", () => {
    expect(dialog).toMatch(/row\.type === "directory" && row\.added \? \([\s\S]*?browse\.addedBadge/)
  })

  test("a parent folder of several repositories offers to add them, and a subfolder offers its repository", () => {
    expect(dialog).toContain("inspectGitRepositories(browseDirectoryAbsolutePath)")
    // Children hint: only for a folder that is not itself a repository, with 2+ repositories not yet added.
    expect(dialog).toMatch(
      /const showChildrenHint =[\s\S]*?!browsedFolderIsRepository[\s\S]*?repositoryNames\.size >= 2[\s\S]*?repositoriesToAdd\.length > 0/,
    )
    // Parent hint: the folder sits inside a repository that is not a project yet.
    expect(dialog).toMatch(/const showParentHint = Boolean\([\s\S]*?!addedProjectPaths\.has\(parentRepositoryKey\)/)
    // Dismissals are remembered and only new repositories bring the hint back.
    expect(dialog).toContain("isChildHintDismissed(dismissedChildren, hintFolderKey, Array.from(repositoryNames))")
    // Repository rows are marked so a single one can be picked with quick add.
    expect(dialog).toContain('repositoryNames.has(row.name) ? "git-repository" : "folder-6"')
  })
})

test("lets an input method have the filter field's keys", () => {
  // The filter field's handler moves the row highlight, opens a row or adds one, and a composition consumes the
  // arrow keys and Enter for its own candidates first. This file has no mount harness, so the contract is asserted
  // against the source, as its neighbours are.
  const guardIndex = dialog.indexOf("if (isIMECompositionEvent(event)) return")
  const firstKeyIndex = dialog.indexOf('if (event.key === "ArrowDown")')

  expect(guardIndex).toBeGreaterThan(-1)
  expect(firstKeyIndex).toBeGreaterThan(-1)
  expect(guardIndex).toBeLessThan(firstKeyIndex)
})
