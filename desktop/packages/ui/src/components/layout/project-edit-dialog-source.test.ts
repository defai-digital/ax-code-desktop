import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The dialog reads the projects store and the icon APIs to render, so this contract is asserted against
// the source, as the neighbouring `*-source.test.ts` files are.
describe("ProjectEditDialog save guards", () => {
  test("refuses a second save while an icon upload or removal is in flight", async () => {
    const source = await readFile(path.resolve(__dirname, "ProjectEditDialog.tsx"), "utf8")

    // The Save button is disabled for those two states, but the name field's Enter key calls the handler
    // directly: a second press uploaded the selected icon twice and ran the removal and close handlers
    // again.
    const guard = source.indexOf("if (isUploadingIcon || isRemovingCustomIcon) return")
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(source.indexOf("if (pendingUploadIconFile) {"))
  })
})
