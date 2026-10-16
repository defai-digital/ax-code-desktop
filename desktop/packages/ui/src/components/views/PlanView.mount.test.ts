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

  test("does not write back the text a load just read", async () => {
    const source = await readFile(path.resolve(__dirname, "PlanView.tsx"), "utf8")

    // Every successful read records what it read, and the autosave effect consults that
    // record before arming its debounce. Dropping either half brings back the write-back
    // that overwrote anything the agent wrote to the plan inside the 350 ms window.
    expect(source).toContain("loadedContentRef.current = text")
    expect(source).toContain("planContentNeedsSave(content, loadedContentRef.current)")
  })
  test("records what an autosave wrote, not only what a load read", async () => {
    const source = await readFile(path.resolve(__dirname, "PlanView.tsx"), "utf8")

    // The record means "what the disk holds". Only the load paths wrote it, so editing away from the loaded
    // text and back to it looked like "nothing to save" while the file kept the newer text: the successful
    // save has to move the record forward too.
    expect(source).toContain("loadedContentRef.current = entry.content")
    // …unless a newer write is already queued: that content is not what the disk will hold, and recording it made
    // a revert to it look like "nothing to save" while the newer write went out anyway.
    expect(source).toContain("if (saveQueueRef.current?.hasQueued(entry.path))")
    // …and only for the file that is on screen: a write for the plan that was open before this one must not
    // become this one's baseline.
    expect(source).toContain("if (resolvedPathRef.current !== entry.path)")
  })

  test("falls back to the last write that landed when the queued one fails", async () => {
    const source = await readFile(path.resolve(__dirname, "PlanView.tsx"), "utf8")

    // A write that is skipped because a newer one is queued still reached the disk, and the newer one can fail:
    // the record stayed on older text while the file held the skipped write's content, so reverting to the older
    // text looked like "nothing to save" and the file kept the newer content.
    expect(source).toContain("diskContentRef.current.set(entry.path, entry.content)")
    expect(source).toContain("const lastWritten = diskContentRef.current.get(entry.path)")
  })

  test("drops the queued edit when the content matches the disk again", async () => {
    const source = await readFile(path.resolve(__dirname, "PlanView.tsx"), "utf8")

    // Type "B", undo back to the loaded "A" inside the 350 ms delay: the effect cleanup cancels the timer but
    // the queued entry stayed, and the flush on unmount wrote the abandoned "B".
    const earlyReturnStart = source.indexOf("if (!planContentNeedsSave(content, loadedContentRef.current)) {")
    expect(earlyReturnStart).toBeGreaterThan(-1)
    // Cleared on the way out, not inside the debounce callback further down (which clears the same ref when
    // its timer fires — that assignment exists either way and would make this assertion vacuous).
    expect(/pendingSaveRef\.current = null\r?\n\s*return/.test(source.slice(earlyReturnStart, earlyReturnStart + 500))).toBe(
      true,
    )
  })
})
