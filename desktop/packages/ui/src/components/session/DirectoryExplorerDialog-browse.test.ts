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
