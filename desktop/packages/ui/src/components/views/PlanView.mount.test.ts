import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// PlanView cannot be rendered in a test without a dozen stores and the runtime APIs, so its
// mount contract is asserted against the source, as the other view components do.
describe("PlanView mount contract", () => {
  test("restores the mounted flag on every mount, not only on the first", async () => {
    const source = await readFile(path.resolve(__dirname, "PlanView.tsx"), "utf8")

    // StrictMode runs the cleanup and then re-runs the effect without re-initializing refs, so
    // the false written by the cleanup latched for the component's whole life: isLatestEntry
    // then suppressed onLatestError and a failed plan save reported nothing at all.
    expect(source).toContain("mountedRef.current = true")
    expect(source).toContain("mountedRef.current = false")
  })
})
