import { beforeEach, describe, expect, test } from "vitest"
import { MAX_CODER_MESSAGE_IDS, useAgentTeamStore } from "./useAgentTeamStore"

const A = { providerID: "moonshot", modelID: "kimi" }
const B = { providerID: "zhipu", modelID: "glm" }
const C = { providerID: "deepseek", modelID: "v4" }

describe("useAgentTeamStore", () => {
  beforeEach(() => {
    useAgentTeamStore.setState({ teamByDirectory: {}, coderMessageIds: [] })
  })

  test("an unknown directory has an empty team", () => {
    const team = useAgentTeamStore.getState().getTeam("/proj")
    expect(team.coder).toEqual({ enabled: false, models: [] })
    expect(team.qa).toEqual({ enabled: false, models: [] })
  })

  test("selections are kept per directory", () => {
    const store = useAgentTeamStore.getState()
    store.toggleModel("/one", "coder", A)
    store.toggleModel("/two", "qa", B)

    expect(useAgentTeamStore.getState().getTeam("/one").coder.models).toEqual([A])
    expect(useAgentTeamStore.getState().getTeam("/one").qa.models).toEqual([])
    expect(useAgentTeamStore.getState().getTeam("/two").qa.models).toEqual([B])
  })

  test("a selection past the limit does not change the store", () => {
    const store = useAgentTeamStore.getState()
    store.toggleModel("/proj", "coder", A)
    store.toggleModel("/proj", "coder", B)
    const before = useAgentTeamStore.getState().teamByDirectory
    store.toggleModel("/proj", "coder", C)
    expect(useAgentTeamStore.getState().teamByDirectory).toBe(before)
  })

  test("setTeam replaces the team and still enforces the limits", () => {
    useAgentTeamStore.getState().toggleModel("/proj", "qa", C)
    useAgentTeamStore.getState().setTeam("/proj", {
      coder: { enabled: true, models: [A, B, C] },
      qa: { enabled: false, models: [] },
    })

    const team = useAgentTeamStore.getState().getTeam("/proj")
    expect(team.coder).toEqual({ enabled: true, models: [A, B] })
    expect(team.qa).toEqual({ enabled: false, models: [] })
  })

  test("unticking a role affects that directory only and remembers the models", () => {
    const store = useAgentTeamStore.getState()
    store.toggleModel("/one", "coder", A)
    store.toggleModel("/two", "coder", B)
    store.setRoleEnabled("/one", "coder", false)

    expect(useAgentTeamStore.getState().getTeam("/one").coder).toEqual({ enabled: false, models: [A] })
    expect(useAgentTeamStore.getState().getTeam("/two").coder.enabled).toBe(true)

    useAgentTeamStore.getState().setRoleEnabled("/one", "coder", true)
    expect(useAgentTeamStore.getState().getTeam("/one").coder.enabled).toBe(true)
  })

  test("coder turns are remembered once each, keeping only the newest", () => {
    const store = useAgentTeamStore.getState()
    store.markCoderMessage("msg_a")
    store.markCoderMessage("msg_a")
    expect(useAgentTeamStore.getState().coderMessageIds).toEqual(["msg_a"])
    expect(store.isCoderMessage("msg_a")).toBe(true)
    expect(store.isCoderMessage("msg_b")).toBe(false)
    expect(store.isCoderMessage("")).toBe(false)

    for (let i = 0; i < MAX_CODER_MESSAGE_IDS; i += 1) store.markCoderMessage(`msg_${i}`)
    expect(useAgentTeamStore.getState().coderMessageIds).toHaveLength(MAX_CODER_MESSAGE_IDS)
    expect(store.isCoderMessage("msg_a")).toBe(false)
  })
})
