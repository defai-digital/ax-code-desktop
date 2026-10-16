import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// Driving the launcher's project switch and submit needs the half of its store set that the
// behavioural tests stub out, so these two guards are asserted against the source, as the
// neighbouring view contracts are.
describe("MultiRunLauncher setup commands", () => {
  const read = () => readFile(path.resolve(__dirname, "MultiRunLauncher.tsx"), "utf8")

  test("drops the previous project's commands when the project changes", async () => {
    const source = await read()

    // The load is asynchronous and `isValid` did not wait for it, so switching projects and pressing
    // Start submitted the old project's shell commands with the new project's worktrees.
    const effect = source.slice(source.indexOf("React.useEffect(() => {\n    // The previous project's commands"))
    const body = effect.slice(0, effect.indexOf("}, [projectRef])"))
    expect(body).toContain("setSetupCommands([])")
    expect(body.indexOf("setSetupCommands([])")).toBeLessThan(body.indexOf("setIsLoadingSetupCommands(true)"))
  })

  test("does not offer Start while the commands are still loading", async () => {
    const source = await read()

    expect(source).toContain("!isLoadingSetupCommands &&")
  })
})
