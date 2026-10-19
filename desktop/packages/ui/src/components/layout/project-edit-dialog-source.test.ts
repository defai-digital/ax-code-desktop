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

  test("abandons a save that was cancelled or unmounted during an icon await", async () => {
    const source = await readFile(path.resolve(__dirname, "ProjectEditDialog.tsx"), "utf8")

    // Cancel closed the dialog but the awaited upload/removal then continued into onSave, writing
    // changes the user had just dismissed.
    const generation = source.indexOf("const saveGeneration = saveGenerationRef.current")
    const uploadAwait = source.indexOf("await uploadProjectIcon(")
    const removeAwait = source.indexOf("await removeProjectIcon(")
    const onSave = source.indexOf("onSave({")

    expect(generation).toBeGreaterThan(-1)
    expect(generation).toBeLessThan(uploadAwait)
    expect(uploadAwait).toBeLessThan(removeAwait)
    expect(removeAwait).toBeLessThan(onSave)

    const checks = [...source.matchAll(/if \(saveGeneration !== saveGenerationRef\.current\) return/g)]
    expect(checks).toHaveLength(4)
    expect(checks.some((check) => (check.index ?? 0) > uploadAwait && (check.index ?? 0) < removeAwait)).toBe(true)
    expect(checks.some((check) => (check.index ?? 0) > removeAwait && (check.index ?? 0) < onSave)).toBe(true)

    // Every close path (Cancel, Escape, overlay, unmount) starts a new generation.
    const close = source.indexOf("const handleOpenChange = React.useCallback(")
    expect(close).toBeGreaterThan(-1)
    expect(source).toContain("saveGenerationRef.current += 1")
    expect(source).toContain("onOpenChange={handleOpenChange}")
    expect(source).toContain("onClick={() => handleOpenChange(false)}")
  })
})
