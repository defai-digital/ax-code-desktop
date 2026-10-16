import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// GitHubBoardView reads five stores and the runtime APIs, so its async contracts are asserted against the
// source, as PlanView's mount contract is. Each assertion names the behaviour it pins.
const readSource = () => readFile(path.resolve(__dirname, "GitHubBoardView.tsx"), "utf8")

describe("GitHubBoardView async contracts", () => {
  test("a new list pass re-enables Load more", async () => {
    const source = await readSource()

    // The list effect bumps the request id that `loadMore`'s cleanup compares against, so an in-flight load-more
    // never cleared its own flag: the button stayed "Loading…" and disabled for the life of the component.
    const effectStart = source.indexOf("const requestId = ++listRequestRef.current")
    expect(effectStart).toBeGreaterThan(-1)
    expect(source.slice(effectStart, effectStart + 400)).toContain("setLoadingMore(false)")
  })

  test("closing or reopening does not re-run the detail effect for the same item", async () => {
    const source = await readSource()

    // The detail pane reads the open/closed state from the bundle, so replacing the selection object with
    // `{...selected, state}` had no display effect and only re-ran the effect: the comment draft was cleared,
    // both bundles dropped and the detail refetched.
    expect(source).not.toContain("setSelected((current) => (current ? { ...current, state: nextState } : current))")
    // …and the bundle write is guarded by the item the mutation was started for, not by a stale closure.
    expect(source).toContain("current.issue.number === targetNumber")
  })

  test("a posted comment only lands on the item it was written for", async () => {
    const source = await readSource()

    // Posting for one issue while another is selected appended the comment to whichever bundle was current and
    // cleared the draft the user had started for that other issue.
    expect(source).toContain("current.pr.number === targetNumber")
    expect(source).toMatch(/if \(detailRequestRef\.current === detailRequestAtCall\) \{\s*setCommentBody\(""\)/)
  })

  test("losing the selection invalidates a detail response still in flight", async () => {
    const source = await readSource()

    // Switching tabs runs the effect with the new kind and the previous row, and the early return when the
    // selection clears left that stray response valid, so it was applied to state with no selection.
    const earlyReturn = source.indexOf("if (!selected || !directory || !github) {")
    expect(earlyReturn).toBeGreaterThan(-1)
    expect(source.slice(earlyReturn, earlyReturn + 400)).toContain("detailRequestRef.current += 1")
  })
})
