import { describe, expect, test, vi } from "vitest"

import { saveFilesViewDraft, waitForFilesViewWrites } from "./filesViewEditorSave"

describe("files view editor save", () => {
  test("skips clean drafts and writes dirty ones", async () => {
    const writeFile = vi.fn(async () => ({ success: true }))
    await expect(
      saveFilesViewDraft({
        path: "/repo/a.ts",
        draftContent: "a\nb",
        displayedContent: "a\nb",
        lineEnding: "\n",
        writeFile,
      }),
    ).resolves.toEqual({ ok: true, skipped: true })
    await expect(
      saveFilesViewDraft({
        path: "/repo/a.ts",
        draftContent: "changed",
        displayedContent: "original",
        lineEnding: "\n",
        writeFile,
      }),
    ).resolves.toEqual({ ok: true, skipped: false })
  })
})

const deferred = () => {
  let resolve: () => void = () => {}
  const promise = new Promise<{ success: boolean }>((done) => {
    resolve = () => done({ success: true })
  })
  return { promise, resolve }
}

describe("files view draft write order", () => {
  test("writes to one file land in the order they were asked for", async () => {
    // An older autosave still in flight must not land after a newer save of the same file.
    const started: string[] = []
    const first = deferred()
    const second = deferred()
    const writeFile = (_path: string, content: string) => {
      started.push(content)
      return content === "older" ? first.promise : second.promise
    }
    const save = (draftContent: string) =>
      saveFilesViewDraft({ path: "/repo/a.txt", draftContent, displayedContent: "", lineEnding: "\n", writeFile })

    const older = save("older")
    const newer = save("newer")
    let settled = false
    const waited = waitForFilesViewWrites("/repo/a.txt").then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(started).toEqual(["older"])

    first.resolve()
    await older
    await Promise.resolve()
    expect(started).toEqual(["older", "newer"])
    expect(settled).toBe(false)

    second.resolve()
    await newer
    await waited
    expect(settled).toBe(true)
  })

  test("another file's write does not wait", async () => {
    const pending = deferred()
    const started: string[] = []
    const writeFile = (path: string) => {
      started.push(path)
      return path === "/repo/a.txt" ? pending.promise : Promise.resolve({ success: true })
    }
    const slow = saveFilesViewDraft({ path: "/repo/a.txt", draftContent: "x", displayedContent: "", lineEnding: "\n", writeFile })
    await saveFilesViewDraft({ path: "/repo/b.txt", draftContent: "y", displayedContent: "", lineEnding: "\n", writeFile })

    expect(started).toEqual(["/repo/a.txt", "/repo/b.txt"])
    pending.resolve()
    await slow
  })
})
