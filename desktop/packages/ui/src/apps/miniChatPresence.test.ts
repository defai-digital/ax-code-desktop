import { describe, expect, test } from "vitest"
import { isMiniChatPresenceMessage, isMiniChatReturnMessage, miniChatReturnMatches } from "./miniChatPresence"

describe("isMiniChatPresenceMessage", () => {
  test("accepts valid mini chat presence messages", () => {
    expect(
      isMiniChatPresenceMessage({
        type: "mini-chat-session-presence",
        sessionId: "session-1",
        directory: "/workspace",
      }),
    ).toBe(true)

    expect(
      isMiniChatPresenceMessage({
        type: "mini-chat-session-presence",
        sessionId: "session-1",
        directory: "/workspace",
        viewed: false,
      }),
    ).toBe(true)
  })

  test("rejects malformed mini chat presence messages", () => {
    expect(isMiniChatPresenceMessage(null)).toBe(false)
    expect(isMiniChatPresenceMessage({ type: "other" })).toBe(false)
    expect(
      isMiniChatPresenceMessage({
        type: "mini-chat-session-presence",
        sessionId: "",
        directory: "/workspace",
      }),
    ).toBe(false)
    expect(
      isMiniChatPresenceMessage({
        type: "mini-chat-session-presence",
        sessionId: "session-1",
        directory: "",
      }),
    ).toBe(false)
    expect(
      isMiniChatPresenceMessage({
        type: "mini-chat-session-presence",
        sessionId: "session-1",
        directory: "/workspace",
        viewed: "yes",
      }),
    ).toBe(false)
    expect(
      isMiniChatPresenceMessage({
        type: "mini-chat-return-to-grid",
        sessionId: "session-1",
        directory: "/workspace",
      }),
    ).toBe(false)
  })
})

describe("miniChatReturnMatches", () => {
  test("matches the same session and project path, and rejects a different session", () => {
    const message = { sessionId: "session-1", directory: "C:/Repo" }
    expect(miniChatReturnMatches(message, "session-1", "c:/repo")).toBe(true)
    expect(miniChatReturnMatches(message, "session-2", "c:/repo")).toBe(false)
    expect(miniChatReturnMatches(message, "session-1", "/other")).toBe(false)
    expect(isMiniChatReturnMessage({ type: "mini-chat-session-presence", sessionId: "session-1", directory: "/workspace" })).toBe(
      false,
    )
  })
})
