import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The dialog needs the config and agent stores plus its selectors to render, so this contract is
// asserted against the source, mirroring ScheduledTaskEditorDialog.draftReset.test.ts.
describe("TodoSendDialog execution reset", () => {
  test("seeds the execution only when the dialog opens, not when a store selection reloads", async () => {
    const source = await readFile(path.resolve(__dirname, "TodoSendDialog.tsx"), "utf8")

    // Opening the dialog loads providers and agents, and `useConfigStore` can rewrite the
    // current selection meanwhile. With those values in the reset's dependencies the effect
    // re-seeded `execution` and replaced the model or agent the user had just picked.
    expect(source).toContain("const initialSelectionRef = React.useRef(")
    expect(source).toContain("const wasOpenRef = React.useRef(open)")

    const start = source.indexOf("const wasOpenRef = React.useRef(open)")
    const effect = source.slice(start)
    const body = effect.slice(0, effect.indexOf("}, [open])"))

    expect(effect).toContain("}, [open])")
    expect(body).toContain("setExecution(getInitialExecution(initialSelectionRef.current))")
    expect(body).not.toContain("currentProviderID")
    expect(body).not.toContain("currentModelID")
    expect(body).not.toContain("currentVariant")
    expect(body).not.toContain("currentAgentName")
    expect(source).not.toContain(
      "}, [open, currentProviderID, currentModelID, currentVariant, currentAgentName])",
    )
  })
})
