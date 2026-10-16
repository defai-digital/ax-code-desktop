import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// SessionDialogs cannot be rendered in a test without a dozen stores, the session list and the git
// worktree APIs, so its delete contract is asserted against the source, as the other view components
// do (see PlanView.mount.test.ts).
describe("SessionDialogs worktree delete", () => {
  test("does not confirm a forced worktree removal before the dirty check finished", async () => {
    const source = await readFile(path.resolve(__dirname, "SessionDialogs.tsx"), "utf8")

    // `getWorktreeStatus` runs asynchronously when the dialog opens, and the uncommitted-changes
    // warning is only rendered once it has finished. The removal itself is forced, so confirming
    // before then discarded work the user was never warned about — the button was enabled and the
    // handler only checked the in-flight flag.
    expect(source).toContain("if (isWorktreeDelete && !hasCompletedDirtyCheck) {")
    expect(source).toContain("disabled={isProcessingDelete || !hasCompletedDirtyCheck}")
  })
})
