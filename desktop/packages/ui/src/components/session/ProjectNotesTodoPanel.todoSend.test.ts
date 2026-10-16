import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// ProjectNotesTodoPanel cannot be rendered in a test without a dozen stores, the runtime APIs and the
// send dialog, so its send contract is asserted against the source, as the other views do.
describe("ProjectNotesTodoPanel todo send", () => {
  test("confirms one todo send at a time, whatever the dialog's prop guard says", async () => {
    const source = await readFile(path.resolve(__dirname, "ProjectNotesTodoPanel.tsx"), "utf8")

    // The dialog guards with the `submitting` prop, which a handler already running cannot observe:
    // two confirms in the same tick both created a session and sent the same message twice. The
    // prompts between the guard and the create are what opened that window, so the ref has to be
    // taken before them and released in the same `finally` as the busy state.
    expect(source).toContain("if (sendInFlightRef.current) {")
    expect(source).toContain("sendInFlightRef.current = true")
    expect(source).toContain("sendInFlightRef.current = false")
  })
})
