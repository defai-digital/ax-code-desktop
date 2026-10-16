import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

const sourcePath = path.resolve(__dirname, "SidebarFilesTree.tsx")

// The tree needs the file store, the runtime APIs and a directory to render, so its dialog
// contracts are asserted against the source, as the neighbouring `*-source.test.ts` files do and
// as the FilesView dialogs do for the same dialogs.
describe("SidebarFilesTree dialog guards", () => {
  const read = () => readFile(sourcePath, "utf8")

  test("refuses a name that would leave the directory the dialog is scoped to", async () => {
    const source = await read()

    // The typed name is joined onto the dialog's directory, so `sub/x.txt` or `../x.txt` writes
    // outside it — and with enough `..` outside the project. FilesView's three branches call the
    // same guard; this tree called none.
    const guardCount = (source.match(/if \(!isFilesViewEntryName\(dialogInputValue\)\)/g) ?? []).length
    expect(guardCount).toBe(3)
    expect(source).toContain("sidebarFilesTree.toast.nameInvalid")
  })

  test("reports a refused write instead of closing the dialog as a success", async () => {
    const source = await read()

    // The Files API reports a refusal by resolving `{ success: false }`, which `.catch` cannot
    // see, and the dialog closed either way: a rejected create, rename or delete looked like it
    // had worked. FilesView's branches report the refusal; so does this one now.
    const successBranches = (source.match(/if \(result\.success\) \{/g) ?? []).length
    const refusalToasts = (source.match(/toast\.error\(t\("sidebarFilesTree\.toast\.operationFailed"\)\)/g) ?? []).length
    expect(successBranches).toBe(4)
    // two per branch: the refused result and the thrown failure
    expect(refusalToasts).toBeGreaterThanOrEqual(8)
  })

  test("refuses to rename onto a file that already exists", async () => {
    const source = await read()

    // `rename` replaces the target, so renaming `a.txt` to a sibling's name destroyed that file
    // behind a "Renamed successfully" toast. The create branch already checks; the rename branch
    // did not.
    expect(source).toContain("const existingTarget = files.statFile ? await files.statFile(newPath)")
    expect(source).toContain("normalizePath(existingTarget.path) !== normalizePath(oldPath)")
    expect(source).toContain("sidebarFilesTree.toast.fileAlreadyExists")
  })
})
