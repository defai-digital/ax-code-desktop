import { describe, expect, test } from "vitest"
import type { Agent } from "@defai-digital/ax-code-sdk/v2"
import { agentLabel, isAgentManageable } from "./agents"

const agent = (overrides: Record<string, unknown>): Agent => ({ name: "a", ...overrides }) as unknown as Agent

describe("isAgentManageable", () => {
  test("lists every visible agent", () => {
    expect(isAgentManageable(agent({ name: "review", native: true }))).toBe(true)
    expect(isAgentManageable(agent({ name: "mine", scope: "project" }))).toBe(true)
  })

  test("keeps a hidden agent that a config file backs, so it can still be managed", () => {
    // Dropping it from Settings left it unreachable: it could not be opened, renamed or deleted
    // there, and hand-editing its file was the only way out.
    expect(isAgentManageable(agent({ name: "mine", hidden: true, scope: "user" }))).toBe(true)
    expect(isAgentManageable(agent({ name: "mine", options: { hidden: true }, scope: "project" }))).toBe(true)
  })

  test("still hides a runtime-internal agent, and one whose scope is not known yet", () => {
    expect(isAgentManageable(agent({ name: "title", hidden: true, native: true }))).toBe(false)
    expect(isAgentManageable(agent({ name: "summary", options: { hidden: true }, builtIn: true }))).toBe(false)
    expect(isAgentManageable(agent({ name: "unknown", hidden: true }))).toBe(false)
  })
})

describe("agentLabel", () => {
  test("shows the display name the runtime supplies", () => {
    // Every picker used the id, so an agent the runtime ships as "Goal Plan Writer" read as
    // "Goal-plan-writer" and searching by the name the user knows found nothing.
    expect(agentLabel({ name: "goal-plan-writer", displayName: "Goal Plan Writer" })).toBe("Goal Plan Writer")
    expect(agentLabel({ name: "security", displayName: "  Security  " })).toBe("Security")
  })

  test("falls back to the capitalized id", () => {
    expect(agentLabel({ name: "review" })).toBe("Review")
    expect(agentLabel({ name: "review", displayName: "   " })).toBe("Review")
    expect(agentLabel({ name: "" })).toBe("")
    expect(agentLabel(null)).toBe("")
  })
})
