import { describe, expect, test } from "vitest"
import { draftSendNeedsModel, draftSetup } from "./draftSetup"

const withModels = [{ models: [{ id: "m" }] }] as never[]
const base = {
  projectCount: 1,
  providersReady: true,
  providers: withModels,
  currentProviderId: "p",
  currentModelId: "m",
}

describe("draftSetup (C UX-05)", () => {
  test("a set-up workspace needs nothing", () => {
    expect(draftSetup(base)).toEqual({ needsProject: false, modelStep: null })
  })

  test("no project asks for one", () => {
    expect(draftSetup({ ...base, projectCount: 0 }).needsProject).toBe(true)
  })

  test("no provider with a model asks to connect one; models with none selected ask to choose", () => {
    expect(draftSetup({ ...base, providers: [], currentProviderId: "", currentModelId: "" }).modelStep).toBe("connect")
    expect(draftSetup({ ...base, providers: [{ models: [] }] as never[] }).modelStep).toBe("connect")
    expect(draftSetup({ ...base, currentModelId: "" }).modelStep).toBe("choose")
  })

  test("before providers have loaded nothing is claimed about models", () => {
    expect(draftSetup({ ...base, providersReady: false, providers: [], currentModelId: "" }).modelStep).toBeNull()
  })
})

describe("draftSendNeedsModel", () => {
  test("blocks only a new-session draft whose model step is open", () => {
    expect(draftSendNeedsModel({ currentSessionId: null, draftOpen: true, modelStep: "connect" })).toBe(true)
    expect(draftSendNeedsModel({ currentSessionId: null, draftOpen: true, modelStep: "choose" })).toBe(true)
    expect(draftSendNeedsModel({ currentSessionId: null, draftOpen: true, modelStep: null })).toBe(false)
    // An existing session keeps its own send path and its per-session model.
    expect(draftSendNeedsModel({ currentSessionId: "ses_1", draftOpen: false, modelStep: "connect" })).toBe(false)
    expect(draftSendNeedsModel({ currentSessionId: null, draftOpen: false, modelStep: "connect" })).toBe(false)
  })
})
