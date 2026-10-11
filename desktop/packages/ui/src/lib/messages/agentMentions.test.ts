import { describe, expect, test } from "vitest"

import type { Agent } from "@defai-digital/ax-code-sdk/v2"

import { parseAgentMentions } from "./agentMentions"

const subagent = (name: string): Agent => ({ name, mode: "subagent", permission: [], options: {} }) as Agent

describe("parseAgentMentions", () => {
  test("resolves the longer agent when names share a prefix", () => {
    const result = parseAgentMentions("@review-plan please", [subagent("review"), subagent("review-plan")])
    expect(result.mention?.name).toBe("review-plan")
    expect(result.mention?.source?.value).toBe("@review-plan")
  })

  test("still matches a standalone shorter name", () => {
    const result = parseAgentMentions("@review please", [subagent("review"), subagent("review-plan")])
    expect(result.mention?.name).toBe("review")
  })

  test("rejects mentions glued to a leading word", () => {
    expect(parseAgentMentions("user@review", [subagent("review")]).mention).toBeNull()
  })

  test("accepts punctuation directly after the name", () => {
    const result = parseAgentMentions("@review!", [subagent("review")])
    expect(result.mention?.name).toBe("review")
  })
})
