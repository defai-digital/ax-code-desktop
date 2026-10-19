import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The composer cannot be mounted without the session, input, mention and inline-comment stores plus the runtime
// APIs, so its contracts are asserted against the source, as PlanView's and the GitHub board's are.
const readSource = () => readFile(path.resolve(__dirname, "ChatInput-impl.tsx"), "utf8")

const SLAVE_BRANCH_START = 'if (commandName === "undo" && currentSessionId)'
const SLASH_CHAIN_END = "\n    const currentSessionDirectory = currentSessionId"

describe("chat slash commands keep the composer's own state", () => {
  test("restores the review comments and files a handled slash command consumed", async () => {
    const source = await readSource()

    const slashBlockStart = source.indexOf("const slashCommand = composerSlashCommand")
    expect(slashBlockStart).toBeGreaterThan(-1)
    const chainEnd = source.indexOf(SLASH_CHAIN_END, slashBlockStart)
    const slashBlock = source.slice(slashBlockStart, chainEnd)

    // The submit folds the consumed review comments into the text and clears the composer before parsing the
    // command; a command does not send that text, and nothing else restores the drafts (the only copy left) — so
    // the comments and the files used to disappear with no trace.
    expect(slashBlock).toContain("restoreConsumedDrafts(drafts)")
    expect(slashBlock).toContain("setAttachedFiles(liveAttachments)")
  })

  test("hands that state back only from a branch that handles the command", async () => {
    const source = await readSource()

    const chainStart = source.indexOf(SLAVE_BRANCH_START)
    const chainEnd = source.indexOf(SLASH_CHAIN_END, chainStart)
    expect(chainStart).toBeGreaterThan(-1)
    expect(chainEnd).toBeGreaterThan(chainStart)
    const chain = source.slice(chainStart, chainEnd)

    // Nothing hands the state back before the chain: a command whose branch does not match — `/summary` in a
    // new-session draft, for instance — falls through to the ordinary send below, which carries the drafts and the
    // files out with the text, so handing them back there sent them twice and left the comments and the attachment
    // chips behind after a successful send.
    expect(source.slice(0, chainStart)).not.toContain("releaseConsumedComposerState()")

    // One hand-back per branch that returns, so a branch added without one shows up here as a count mismatch.
    const handBacks = chain.match(/releaseConsumedComposerState\(\)/g) ?? []
    const returns = chain.match(/\n {8}return\n/g) ?? []
    expect(handBacks.length).toBeGreaterThan(0)
    expect(handBacks.length).toBe(returns.length)
    // …and it is the branch's first statement: a branch that awaits before handing the state back (a `/compact`
    // that sends, a `/summary` that waits) left the files attached *during* that await to be replaced by the
    // pre-submit snapshot, and evaluated the session guard after the command had created or switched a session.
    const atBranchHead = chain.match(/\{\r?\n {8}releaseConsumedComposerState\(\)/g) ?? []
    expect(atBranchHead.length).toBe(handBacks.length)
  })

  test("never folds queued prompts into a shell or slash submit", async () => {
    const source = await readSource()

    // The submit kind must come from the composer, before the queue is merged: merging first
    // ran the queued prompt in the terminal (shell mode) or sent the typed command to the
    // model as a prompt part while clearing the queue.
    const decisionAt = source.indexOf("const composerSlashCommand")
    const mergeAt = source.indexOf("// Process queued messages first")
    expect(decisionAt).toBeGreaterThan(-1)
    expect(mergeAt).toBeGreaterThan(decisionAt)
    const decisionBlock = source.slice(decisionAt, mergeAt)
    expect(decisionBlock).toContain("const consumesQueue = !composerSlashCommand && !isShellSubmit")
    expect(source.slice(mergeAt, mergeAt + 200)).toContain("if (consumesQueue) {")
    expect(source).toContain("const slashCommand = composerSlashCommand")
    // The queue is only cleared for a submit that consumed it.
    expect(source).toContain("if (consumesQueue) {\n      if (currentSessionId && queuedMessageId)")
  })
})
