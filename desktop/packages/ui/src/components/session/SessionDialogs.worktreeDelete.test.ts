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
  test("does not restart the dialog setup when the status check writes its result", async () => {
    const source = await readFile(path.resolve(__dirname, "SessionDialogs.tsx"), "utf8")

    // The check writes the status back into `deleteDialog`. With the object itself in the
    // dependency array the effect re-ran, and its setup re-initialised the choices the user makes
    // in this dialog: the "also delete the remote branch" checkbox, the dirty-worktree warning
    // and the Delete button's disabled state while a second check ran.
    expect(source).toContain("}, [deleteDialogKey, getWorktreeMetadata])")
    expect(source).not.toContain("}, [deleteDialog, getWorktreeMetadata])")
    expect(source).toContain("const deleteDialogRef = React.useRef(deleteDialog)")
    expect(source).toContain("const dialog = deleteDialogRef.current")
  })
})
