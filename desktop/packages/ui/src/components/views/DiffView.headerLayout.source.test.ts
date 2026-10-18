import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// `DiffView` is a store-connected view: rendering it needs the git store, the runtime APIs and a diff worker, so
// its header wiring is asserted against the source, as `DashboardPanel`'s and the pending-toast wiring are.
const readSource = () => readFile(path.resolve(__dirname, "DiffView.tsx"), "utf8")

describe("DiffView header layout wiring", () => {
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
