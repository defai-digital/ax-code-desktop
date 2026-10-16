import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The composer cannot be mounted without the session, input, mention and inline-comment stores plus the runtime
// APIs, so its contracts are asserted against the source, as PlanView's and the GitHub board's are.
const readSource = () => readFile(path.resolve(__dirname, "ChatInput-impl.tsx"), "utf8")

describe("chat slash commands keep the composer's own state", () => {
  test("restores the review comments and files a slash submit consumed", async () => {
    const source = await readSource()

    const slashBlockStart = source.indexOf("const slashCommand = parseChatSlashCommand(primaryText, inputMode)")
    expect(slashBlockStart).toBeGreaterThan(-1)
    const slashBlock = source.slice(slashBlockStart, slashBlockStart + 900)

    // The submit folds the consumed review comments into the text and clears the composer before parsing the
    // command; a command does not send that text, and nothing else restores the drafts (the only copy left) — so
    // the comments and the files used to disappear with no trace.
    expect(slashBlock).toContain("restoreConsumedDrafts(drafts)")
    expect(slashBlock).toContain("setAttachedFiles(attachedFiles)")
  })
})
