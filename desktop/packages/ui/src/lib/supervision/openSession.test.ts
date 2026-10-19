import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

import { openSupervisedSession } from "./openSession"

describe("openSupervisedSession", () => {
  beforeEach(() => {
    useSupervisionStore.setState({
      missionControlOpen: true,
      needsYouPopoverOpen: true,
      compareRunGroupKey: "run-group",
      recentSessionIds: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("leaves every supervision overlay, including compare, and records the visit", () => {
    const setActiveProject = vi.spyOn(useProjectsStore.getState(), "setActiveProject").mockImplementation(() => {})
    const setActiveMainTab = vi.spyOn(useUIStore.getState(), "setActiveMainTab").mockImplementation(() => {})
    const setCurrentSession = vi.spyOn(useSessionUIStore.getState(), "setCurrentSession").mockImplementation(() => {})

    openSupervisedSession({ sessionId: "ses_1", projectId: "project_1", directory: "/repo" })

    expect(setActiveProject).toHaveBeenCalledWith("project_1")
    expect(setActiveMainTab).toHaveBeenCalledWith("chat")
    expect(setCurrentSession).toHaveBeenCalledWith("ses_1", "/repo")
    const supervision = useSupervisionStore.getState()
    expect(supervision.missionControlOpen).toBe(false)
    expect(supervision.needsYouPopoverOpen).toBe(false)
    expect(supervision.compareRunGroupKey).toBeNull()
    expect(supervision.recentSessionIds[0]).toBe("ses_1")
  })
})
