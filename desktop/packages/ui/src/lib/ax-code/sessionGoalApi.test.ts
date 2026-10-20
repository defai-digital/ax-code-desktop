import { afterEach, describe, expect, test, vi } from "vitest"

import { axCodeClient } from "@/lib/ax-code/client"

import { fetchSessionGoal } from "./sessionGoalApi"

const goal = vi.fn()

describe("fetchSessionGoal", () => {
  afterEach(() => {
    goal.mockReset()
    vi.restoreAllMocks()
  })

  test("reads GET /session/{id}/goal through the scoped client", async () => {
    const payload = { sessionID: "ses_1", objective: "Ship it", status: "active" }
    goal.mockResolvedValue({ data: payload })
    vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ session: { goal } } as never)

    await expect(fetchSessionGoal(" ses_1 ", "  /repo  ")).resolves.toEqual(payload)
    expect(axCodeClient.getScopedSdkClient).toHaveBeenCalledWith("/repo")
    expect(goal).toHaveBeenCalledWith({ sessionID: "ses_1", directory: "/repo" })
  })

  test("a null body is a session with no goal", async () => {
    goal.mockResolvedValue({ data: null })
    vi.spyOn(axCodeClient, "getSdkClient").mockReturnValue({ session: { goal } } as never)

    await expect(fetchSessionGoal("ses_1", null)).resolves.toBeNull()
    expect(goal).toHaveBeenCalledWith({ sessionID: "ses_1" })
  })

  test("an error response fails the read", async () => {
    goal.mockResolvedValue({ error: { message: "unavailable" } })
    vi.spyOn(axCodeClient, "getSdkClient").mockReturnValue({ session: { goal } } as never)

    await expect(fetchSessionGoal("ses_1")).rejects.toThrow(/unavailable/)
  })

  test("rejects a blank session id before calling the client", async () => {
    vi.spyOn(axCodeClient, "getSdkClient").mockReturnValue({ session: { goal } } as never)

    await expect(fetchSessionGoal("   ")).rejects.toThrow(/session id is required/i)
    expect(goal).not.toHaveBeenCalled()
  })
})
