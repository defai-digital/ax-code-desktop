import fs from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

// main.js runs only inside Electron, so this guard is asserted against the source, as the other
// unimportable main-process paths are.
describe("settings mutation guard", () => {
  test("refuses to write over a settings file it could not read", () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "main.js"), "utf8")

    const mutate = source.indexOf("const mutateSettingsRoot = (mutator) => {")
    const guard = source.indexOf("if (!read.ok) {", mutate)
    const write = source.indexOf("await writeJsonFile(settingsFilePath(), nextRoot)", mutate)

    expect(mutate).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(-1)
    // The refusal has to precede the write: an invalid settings.json answered `{}` and the mutation
    // then replaced the user's theme, projects, runtime path and shortcuts with its own change.
    expect(guard).toBeLessThan(write)
    expect(source.slice(guard, write)).toContain("could not be read")
  })
})
