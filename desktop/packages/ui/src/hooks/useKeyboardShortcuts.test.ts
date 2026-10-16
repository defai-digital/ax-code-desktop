import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// No harness renders this hook: it reads six stores, the runtime APIs and the theme system, so its contracts are
// asserted against the source, as PlanView's and the GitHub board's are.
const readSource = () => readFile(path.resolve(__dirname, "useKeyboardShortcuts.ts"), "utf8")

describe("useKeyboardShortcuts abort priming", () => {
  test("remembers the session the first Escape was pressed in", async () => {
    const source = await readSource()

    // The priming was a bare timestamp: pressing Escape in one session and switching within the three-second
    // window armed the second Escape for the session that happened to be on screen, aborting it with no banner.
    expect(source).toContain("abortPrimedSessionRef")
    expect(source).toContain("primedForSession === (sessionId ?? null)")
    expect(source).toContain("abortPrimedSessionRef.current = sessionId ?? null")
  })
})
