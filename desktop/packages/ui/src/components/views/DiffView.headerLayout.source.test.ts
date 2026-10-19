import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// `DiffView` is a store-connected view: rendering it needs the git store, the runtime APIs and a diff worker, so
// its header wiring is asserted against the source, as `DashboardPanel`'s and the pending-toast wiring are.
const readSource = () => readFile(path.resolve(__dirname, "DiffView.tsx"), "utf8")

describe("DiffView header layout wiring", () => {
  test("the open-at-change fallback fetch reports failures instead of rejecting", async () => {
    const source = await readSource()
    const start = source.indexOf("const openFileInEditorAtChange = React.useCallback(")
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf("const openSelectedFileInEditorAtChange", start)
    expect(end).toBeGreaterThan(start)
    const callback = source.slice(start, end)

    // Both call sites fire this with `void`; an unhandled `getGitFileDiff` rejection cleared the
    // spinner and showed nothing. The fallback fetch and validation must sit in a try/catch that
    // surfaces a toast, like the file-open failure above them.
    const catchIndex = callback.indexOf("} catch (error) {")
    expect(catchIndex).toBeGreaterThan(callback.indexOf("await git.getGitFileDiff("))
    expect(catchIndex).toBeGreaterThan(callback.indexOf("await validateContextFileOpen("))
    expect(callback.slice(catchIndex)).toContain("toast.error(getContextFileOpenFailureMessage(")
  })

  test("the header picks the layout for every diff, not an override for the files on screen", async () => {
    // Writing one override per visible file left `diffLayoutPreference` at its old value: the pick was forgotten
    // as soon as a file appeared that was not on screen, and Appearance disagreed with what the header showed.
    const source = await readSource()

    const handlerIndex = source.indexOf("const handleHeaderLayoutChange = React.useCallback(")
    expect(handlerIndex).toBeGreaterThan(-1)
    const handler = source.slice(handlerIndex, source.indexOf("\n  )", handlerIndex))
    expect(handler).toContain("setDiffLayoutForAllFiles(")
    expect(handler).not.toContain("setDiffFileLayout(")
    // The toggle on a file row still changes that one file (keyed by project,
    // so two projects' copies of the same path keep separate layouts).
    expect(source).toContain("setDiffFileLayout(directory, file.path, nextLayout)")
  })
})
