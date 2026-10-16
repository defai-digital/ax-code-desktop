import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// These click handlers live inside memoized chat components that need the runtime context, the git store and a
// populated message tree to render, so what the editor is asked to open is asserted against the source, as the
// config editors' and PlanView's contracts are.
const readSource = (relativePath: string) => readFile(path.resolve(__dirname, relativePath), "utf8")

describe("a click that opens a changed file resolves its absolute path", () => {
  test("the pending-changes bar uses the git path's own absolute-path test", async () => {
    // `extractGitChangedFiles` stores every path absolute, a Windows drive path included, and a check for a
    // leading `/` alone prefixed it with the directory: the editor was asked for `C:/repo/C:/repo/src/app.ts`.
    const source = await readSource("PendingChangesBar.tsx")

    expect(source).toContain("isAbsoluteChangedFilePath(file.path)")
    expect(source).not.toContain('file.path.startsWith("/")')
  })

  test("the turn's changed-files dropdown resolves a tool path with the tool-path helper", async () => {
    // Its entries come from `extractChangedFiles`, which copies the path a tool reported — `C:\repo\a.ts` or
    // `c:/repo/a.ts` — and the git-path test reads neither, so the drive path was prefixed with the directory it
    // already starts with.
    const source = await readSource("TurnChangedFilesDropdown.tsx")

    expect(source).toContain("toAbsoluteToolPath(currentDirectory, file.path)")
    expect(source).not.toContain("isAbsoluteChangedFilePath(file.path)")
    expect(source).not.toContain('file.path.startsWith("/")')
  })

  test("the tool row resolves its file path through the shared helper", async () => {
    const source = await readSource("message/parts/ToolPart-impl.tsx")

    expect(source).toContain("toAbsoluteToolPath(currentDirectory, filePath)")
    expect(source).not.toContain('if (!filePath.startsWith("/"))')
  })
})
