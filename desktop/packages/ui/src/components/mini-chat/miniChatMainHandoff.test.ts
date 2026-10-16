import { describe, expect, test, vi } from "vitest"
import { buildMiniChatMainHandoffPayload, focusMainWindowOrKeepOpen } from "./miniChatMainHandoff"

const handoffPayload = buildMiniChatMainHandoffPayload({ currentSessionId: "ses_1", openDirectory: "/repo" })

describe("buildMiniChatMainHandoffPayload", () => {
  test("prefers the active open directory when focusing a session from mini-chat", () => {
    expect(
      buildMiniChatMainHandoffPayload({
        currentSessionId: "ses_123",
        openDirectory: "/repo/.worktrees/feature",
        sessionDirectory: "/repo",
        currentDirectory: "/repo",
      }),
    ).toEqual({
      sessionId: "ses_123",
      directory: "/repo/.worktrees/feature",
    })
  })

  test("falls back through session and current directories for session handoff", () => {
    expect(
      buildMiniChatMainHandoffPayload({
        currentSessionId: "ses_123",
        openDirectory: "",
        sessionDirectory: "/repo",
        currentDirectory: "/fallback",
      }),
    ).toEqual({
      sessionId: "ses_123",
      directory: "/repo",
    })
  })

  test("builds a draft handoff payload when no session is selected", () => {
    expect(
      buildMiniChatMainHandoffPayload({
        openDirectory: " /repo ",
        currentDirectory: "/fallback",
        draftProjectId: " project-1 ",
      }),
    ).toEqual({
      mode: "draft",
      directory: "/repo",
      projectId: "project-1",
    })
  })
})

describe("focusMainWindowOrKeepOpen", () => {
  test("closes the mini-chat once the main window accepted the hand-off", async () => {
    const commands: string[] = []
    const invoke = vi.fn(async (command: string) => {
      commands.push(command)
      return command === "desktop_focus_main_window" ? { focused: true } : null
    })

    await expect(focusMainWindowOrKeepOpen(invoke, handoffPayload)).resolves.toBe(true)
    expect(commands).toEqual(["desktop_focus_main_window", "desktop_close_current_window"])
  })

  test("keeps the mini-chat open when the hand-off is refused", async () => {
    // The command answers {focused:false} when it could not reveal a window, and refuses a
    // non-local sender outright: both leave this window as the user's only one.
    const commands: string[] = []
    const refused = vi.fn(async (command: string) => {
      commands.push(command)
      return { focused: false }
    })

    await expect(focusMainWindowOrKeepOpen(refused, handoffPayload)).resolves.toBe(false)
    expect(commands).toEqual(["desktop_focus_main_window"])
  })

  test("reports a rejection instead of letting it escape as an unhandled one", async () => {
    const rejected = vi.fn(async () => {
      throw new Error("not allowed for this frame")
    })

    await expect(focusMainWindowOrKeepOpen(rejected, handoffPayload)).resolves.toBe(false)
  })

  test("still reports the hand-off as taken over when closing this window fails", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "desktop_focus_main_window") return { focused: true }
      throw new Error("close refused")
    })

    await expect(focusMainWindowOrKeepOpen(invoke, handoffPayload)).resolves.toBe(true)
  })
})
