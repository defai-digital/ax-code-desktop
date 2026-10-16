import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The dialog needs a dozen stores and its own autocompletes to render, so this contract is
// asserted against the source, as PlanView and the other views do.
describe("ScheduledTaskEditorDialog draft reset", () => {
  test("resets the draft for the target it belongs to, not for a provider reload", async () => {
    const source = await readFile(path.resolve(__dirname, "ScheduledTaskEditorDialog.tsx"), "utf8")

    // The dialog loads the provider list when it opens (the effect above it), and
    // useConfigStore rewrites the current selection when the stored one is not selectable.
    // With those three values in the dependency array this reset fired again and replaced the
    // draft the user was typing — name, prompt and schedule — and the openedRef baseline
    // under it. The values now reach the draft through a ref, so the deps stay what the reset
    // belongs to: opening, and switching to a different task or family.
    expect(source).toContain("const initialSelectionRef = React.useRef(")
    expect(source).toContain("initialSelectionRef.current = {")

    const reset = source.slice(source.indexOf("const next = toDraft(task, initialSelectionRef.current, family)"))
    const resetBody = reset.slice(0, reset.indexOf("}, [open, task, family])"))

    expect(reset).toContain("}, [open, task, family])")
    expect(resetBody).not.toContain("currentProviderID")
    expect(resetBody).not.toContain("currentModelID")
    expect(resetBody).not.toContain("currentAgentName")
  })
})
