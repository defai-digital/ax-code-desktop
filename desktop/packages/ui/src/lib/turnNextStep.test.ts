import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

import { applyTurnNextStep, resolveTurnNextStepDestination } from "./turnNextStep"

describe("turn next step destinations", () => {
  test("review opens diff review and commit opens git", () => {
    const opened: string[] = []
    const sinks = {
      openDiffReview: () => opened.push("diff-review"),
      openGit: () => opened.push("git"),
    }

    expect(resolveTurnNextStepDestination("review")).toBe("diff-review")
    expect(resolveTurnNextStepDestination("commit")).toBe("git")
    expect(applyTurnNextStep("review", sinks)).toBe("diff-review")
    expect(applyTurnNextStep("commit", sinks)).toBe("git")
    expect(opened).toEqual(["diff-review", "git"])
  })

  test("the post-turn controls call the shipped destination function", () => {
    const source = readFileSync(sourcePath("../components/chat/DoneNotCommittedNudge.tsx"), "utf8")
    expect(source).toContain('applyTurnNextStep("review"')
    expect(source).toContain('applyTurnNextStep("commit"')
    expect(source).not.toContain("onClick={openGitPanel}")
  })
})
