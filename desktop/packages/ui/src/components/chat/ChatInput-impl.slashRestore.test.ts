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

    const slashBlockStart = source.indexOf("const slashCommand = parseChatSlashCommand(primaryText, inputMode)")
    expect(slashBlockStart).toBeGreaterThan(-1)
    const chainEnd = source.indexOf(SLASH_CHAIN_END, slashBlockStart)
    const slashBlock = source.slice(slashBlockStart, chainEnd)

    // The submit folds the consumed review comments into the text and clears the composer before parsing the
    // command; a command does not send that text, and nothing else restores the drafts (the only copy left) — so
    // the comments and the files used to disappear with no trace.
    expect(slashBlock).toContain("restoreConsumedDrafts(drafts)")
    expect(slashBlock).toContain("setAttachedFiles(attachedFiles)")
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
    expect(chain).toMatch(/releaseConsumedComposerState\(\)\r?\n\s*return\b/)
  })
})
