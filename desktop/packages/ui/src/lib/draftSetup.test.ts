import { describe, expect, test } from "vitest"
import { draftSendNeedsModel, draftSetup, draftTargetState } from "./draftSetup"

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

describe("draftTargetState (C UX-03)", () => {
  const worktree = {
    draftOpen: true,
    currentSessionId: null,
    selectedDirectory: "/repo/.worktrees/feature",
    projectRoot: "/repo",
    listed: false,
    keepUnlisted: false,
    discoveringBranches: false,
    worktreeListingReady: true,
  }

  test("a listed target, the project root, or a target being set up is fine", () => {
    expect(draftTargetState({ ...worktree, listed: true })).toBe("ok")
    expect(draftTargetState({ ...worktree, selectedDirectory: "/repo" })).toBe("ok")
    expect(draftTargetState({ ...worktree, keepUnlisted: true })).toBe("ok")
  })

  test("an unlisted worktree is only checking while branches or the listing are not known", () => {
    expect(draftTargetState({ ...worktree, discoveringBranches: true })).toBe("checking")
    // No successful listing yet (or it failed): absence proves nothing.
    expect(draftTargetState({ ...worktree, worktreeListingReady: false })).toBe("checking")
  })

  test("a successful listing without it confirms the worktree is gone", () => {
    expect(draftTargetState(worktree)).toBe("missing")
  })

  test("a target the draft recorded as gone stays gone, even if a stale listing shows it or a refresh fails", () => {
    expect(draftTargetState({ ...worktree, lost: true, listed: true })).toBe("missing")
    expect(draftTargetState({ ...worktree, lost: true, worktreeListingReady: false })).toBe("missing")
  })

  test("an existing session or a closed draft has no draft target", () => {
    expect(draftTargetState({ ...worktree, currentSessionId: "ses_1" })).toBe("ok")
    expect(draftTargetState({ ...worktree, draftOpen: false })).toBe("ok")
  })
})
