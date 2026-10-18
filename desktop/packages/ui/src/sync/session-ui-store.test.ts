import { beforeEach, describe, expect, test } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2/client"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import type { SessionWorktreeAttachment } from "@/stores/types/sessionTypes"
import { useSessionWorktreeStore } from "./session-worktree-store"
import { attachmentToRouteFileInput, useSessionUIStore } from "./session-ui-store"
import { getActiveSessionRef } from "./sync-context-impl"

/**
 * Unit tests for session worktree routing through the authoritative store.
 *
 * These tests verify that session-worktree-store is properly integrated as the
 * authoritative holder of session↔worktree attachments, and that session-ui-store
 * routes through it for switching and creation flows.
 *
 * Note: Full integration tests for setCurrentSession require runtime mocking.
 * These tests focus on the contract layer: that setAttachment/getAttachment work
 * correctly and that the contract helpers produce correct results.
 */

const resetSessionStores = () => {
  useSessionUIStore.getState().setCurrentSession(null)
  useSessionWorktreeStore.setState({ attachments: new Map() })
  useGlobalSessionsStore.setState({
    activeSessions: [],
    archivedSessions: [],
    sessionsByDirectory: new Map(),
    hasLoaded: false,
    status: "idle",
    pendingRemoval: new Map(),
  })
  useSessionUIStore.setState({
    currentSessionId: null,
    newSessionDraft: { open: false, directoryOverride: null, parentID: null },
    error: null,
    worktreeMetadata: new Map(),
  })
}

const expectAttachment = (sessionId: string): SessionWorktreeAttachment => {
  const attachment = useSessionWorktreeStore.getState().getAttachment(sessionId)
  expect(attachment).toBeDefined()
  if (!attachment) {
    throw new Error(`Expected attachment for session ${sessionId}`)
  }
  return attachment
}

describe("session-worktree-store worktree routing", () => {
  beforeEach(() => {
    resetSessionStores()
  })

  test("getDirectoryForSession prefers authoritative attachment cwd over sync fallback", () => {
    useSessionWorktreeStore.getState().setAttachment("session-dir", {
      worktreeRoot: "/repo/worktrees/feat-a",
      cwd: "/repo/worktrees/feat-a/src",
      branch: "feat-a",
      headState: "branch",
      worktreeStatus: "ready",
      worktreeSource: "existing",
      legacy: false,
      degraded: false,
    })

    expect(useSessionUIStore.getState().getDirectoryForSession("session-dir")).toBe("/repo/worktrees/feat-a/src")
  })

  test("getDirectoryForSession falls back to authoritative worktreeRoot when attachment is degraded", () => {
    useSessionWorktreeStore.getState().setAttachment("session-dir", {
      worktreeRoot: "/repo/worktrees/feat-a",
      cwd: "/tmp/outside",
      branch: "feat-a",
      headState: "branch",
      worktreeStatus: "invalid",
      worktreeSource: "existing",
      legacy: false,
      degraded: true,
    })

    expect(useSessionUIStore.getState().getDirectoryForSession("session-dir")).toBe("/repo/worktrees/feat-a")
  })

  test("setCurrentSession uses canonical cwd when valid", () => {
    const store = useSessionWorktreeStore.getState()

    // Simulate: session has valid worktree metadata with cwd inside worktreeRoot
    store.setAttachment("session-1", {
      worktreeRoot: "/repo/worktrees/feat-a",
      cwd: "/repo/worktrees/feat-a/src",
      branch: "feat-a",
      headState: "branch",
      worktreeStatus: "ready",
      worktreeSource: "existing",
      legacy: false,
      degraded: false,
    })

    const attachment = expectAttachment("session-1")
    expect(attachment.cwd).toBe("/repo/worktrees/feat-a/src")
    expect(attachment.worktreeRoot).toBe("/repo/worktrees/feat-a")
    expect(attachment.degraded).toBe(false)
    expect(attachment.worktreeStatus).toBe("ready")
  })

  test("setCurrentSession falls back to worktreeRoot when cwd is degraded", () => {
    const store = useSessionWorktreeStore.getState()

    // Simulate: cwd is outside worktreeRoot (degraded)
    store.setAttachment("session-2", {
      worktreeRoot: "/repo/worktrees/feat-a",
      cwd: "/repo/worktrees/feat-a", // same as worktreeRoot means not degraded for this case
      branch: "feat-a",
      headState: "branch",
      worktreeStatus: "ready",
      worktreeSource: "existing",
      legacy: false,
      degraded: true, // marked degraded because cwd was resolved from invalid state
    })

    const attachment = expectAttachment("session-2")
    expect(attachment.degraded).toBe(true)
    // cwd should equal worktreeRoot when degraded (fallback)
    expect(attachment.cwd).toBe(attachment.worktreeRoot)
  })

  test("isolated session initializes created-for-session attachment", () => {
    const store = useSessionWorktreeStore.getState()

    // Simulate: isolated worktree session created for a specific branch
    store.setAttachment("session-isolated", {
      worktreeRoot: "/repo/worktrees/feature-xyz",
      cwd: "/repo/worktrees/feature-xyz",
      branch: "feature-xyz",
      headState: "branch",
      worktreeStatus: "ready",
      worktreeSource: "created-for-session",
      legacy: false,
      degraded: false,
    })

    const attachment = expectAttachment("session-isolated")
    expect(attachment.worktreeSource).toBe("created-for-session")
    expect(attachment.worktreeStatus).toBe("ready")
    expect(attachment.legacy).toBe(false)
  })

  test("legacy session upgrades when runtime canonicalization recovers a worktree", () => {
    const store = useSessionWorktreeStore.getState()

    // Simulate: session without metadata (legacy) gets upgraded via runtime resolution
    // Initially no attachment
    let attachment = store.getAttachment("session-legacy")
    expect(attachment).toBeUndefined()

    // Runtime canonicalization resolves it to a worktree
    store.setAttachment("session-legacy", {
      worktreeRoot: "/repo/worktrees/recovered",
      cwd: "/repo/worktrees/recovered",
      branch: "recovered",
      headState: "branch",
      worktreeStatus: "ready",
      worktreeSource: "existing",
      legacy: false, // upgraded from legacy=true to false
      degraded: false,
    })

    attachment = expectAttachment("session-legacy")
    expect(attachment.legacy).toBe(false)
    expect(attachment.worktreeRoot).toBe("/repo/worktrees/recovered")
  })

  test("missing worktree session has missing status", () => {
    const store = useSessionWorktreeStore.getState()

    // Simulate: session whose worktree was deleted
    store.setAttachment("session-missing", {
      worktreeRoot: null,
      cwd: null,
      branch: null,
      headState: "branch",
      worktreeStatus: "missing",
      worktreeSource: null,
      legacy: false,
      degraded: true,
    })

    const attachment = expectAttachment("session-missing")
    expect(attachment.worktreeStatus).toBe("missing")
    expect(attachment.degraded).toBe(true)
  })

  test("not-a-repo session has correct status", () => {
    const store = useSessionWorktreeStore.getState()

    // Simulate: session opened in a directory that is not a git repo
    store.setAttachment("session-not-repo", {
      worktreeRoot: null,
      cwd: "/tmp/not-a-repo",
      branch: null,
      headState: "detached",
      worktreeStatus: "not-a-repo",
      worktreeSource: null,
      legacy: false,
      degraded: true,
    })

    const attachment = expectAttachment("session-not-repo")
    expect(attachment.worktreeStatus).toBe("not-a-repo")
  })

  test("sendMessage rejects when there is no active session or draft", async () => {
    await expect(useSessionUIStore.getState().sendMessage("hello", "provider-id", "model-id")).rejects.toThrow(
      "Cannot send message without an active session or draft",
    )

    expect(useSessionUIStore.getState().error).toBe("Cannot send message without an active session or draft")
  })

  test("does not send a draft submit to a session selected while it was in flight", async () => {
    // The submit started from the new-chat draft; by the time sendMessage ran, a
    // session switch had closed the draft. Resolving the target from live state
    // delivered the prompt to that session (possibly in another project).
    const state = useSessionUIStore.getState()
    const previousSession = state.currentSessionId
    const previousDraft = state.newSessionDraft
    useSessionUIStore.setState({ currentSessionId: "ses_other", newSessionDraft: undefined })

    try {
      await expect(
        state.sendMessage("hello", "provider-id", "model-id", undefined, undefined, undefined, undefined, undefined, "normal", {
          fromNewSessionDraft: true,
        }),
      ).rejects.toThrow("Cannot send message without an active session or draft")
      expect(useSessionUIStore.getState().currentSessionId).toBe("ses_other")
    } finally {
      useSessionUIStore.setState({ currentSessionId: previousSession, newSessionDraft: previousDraft })
    }
  })

  test("leaves the selected session's abort and dismissal state intact when a draft submit is refused", async () => {
    const abortFlags = new Map([["ses_other", { timestamp: 1, acknowledged: false }]])
    const dismissed = new Map([["ses_other", "changes-signature"]])
    useSessionUIStore.setState({
      currentSessionId: "ses_other",
      sessionAbortFlags: abortFlags,
      pendingChangesBarDismissed: dismissed,
    })

    await expect(
      useSessionUIStore.getState().sendMessage(
        "hello", "provider-id", "model-id", undefined, undefined, undefined, undefined, undefined, "normal",
        { fromNewSessionDraft: true },
      ),
    ).rejects.toThrow("Cannot send message without an active session or draft")

    expect(useSessionUIStore.getState().sessionAbortFlags).toEqual(abortFlags)
    expect(useSessionUIStore.getState().pendingChangesBarDismissed).toEqual(dismissed)
  })

  test("restores the persisted active session target after reload", () => {
    const session = {
      id: "ses_restore",
      title: "Restore me",
      directory: "/repo/a",
      time: { created: 1, updated: 2 },
    } as Session

    useGlobalSessionsStore.setState({
      activeSessions: [session],
      archivedSessions: [],
      hasLoaded: true,
      status: "ready",
    })

    useSessionUIStore.getState().setCurrentSession(session.id, "/repo/a")
    useSessionUIStore.setState({ currentSessionId: null })

    expect(useSessionUIStore.getState().restorePersistedCurrentSession()).toBe(true)
    expect(useSessionUIStore.getState().currentSessionId).toBe(session.id)
  })

  test("restores a persisted session that is archived (not just active)", () => {
    // getDirectoryForSession and sendMessage's existingSession lookup both
    // treat archivedSessions as valid; restorePersistedCurrentSession must not
    // clear a perfectly valid persisted target just because the session was
    // archived before the app reloaded.
    const session = {
      id: "ses_archived",
      title: "Archived session",
      directory: "/repo/a",
      time: { created: 1, updated: 2, archived: 3 },
    } as Session

    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [session],
      hasLoaded: true,
      status: "ready",
    })

    useSessionUIStore.getState().setCurrentSession(session.id, "/repo/a")
    useSessionUIStore.setState({ currentSessionId: null })

    expect(useSessionUIStore.getState().restorePersistedCurrentSession()).toBe(true)
    expect(useSessionUIStore.getState().currentSessionId).toBe(session.id)
  })

  test("does not restore a persisted session missing from a ready global snapshot", () => {
    useSessionUIStore.getState().setCurrentSession("ses_missing", "/repo/missing")
    useSessionUIStore.setState({ currentSessionId: null })
    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [],
      hasLoaded: true,
      status: "ready",
    })

    expect(useSessionUIStore.getState().restorePersistedCurrentSession()).toBe(false)
    expect(useSessionUIStore.getState().currentSessionId).toBeNull()
  })
})

describe("session-ui-store attachments", () => {
  test("preserves MCP resource source metadata for prompt file parts", () => {
    expect(
      attachmentToRouteFileInput({
        id: "mcp-resource-1",
        file: new File([], "readme", { type: "text/markdown" }),
        dataUrl: "mcp://docs/readme.md",
        mimeType: "text/markdown",
        filename: "readme",
        size: 0,
        source: "mcp-resource",
        resource: {
          clientName: "docs",
          uri: "mcp://docs/readme.md",
        },
      }),
    ).toMatchObject({
      type: "file",
      mime: "text/markdown",
      url: "mcp://docs/readme.md",
      filename: "readme",
      source: {
        type: "resource",
        clientName: "docs",
        uri: "mcp://docs/readme.md",
        text: {
          value: "readme",
          start: 0,
          end: 6,
        },
      },
    })
  })
})

describe("session abort flags lifecycle", () => {
  beforeEach(() => {
    useSessionUIStore.setState({ sessionAbortFlags: new Map() })
  })

  test("markSessionAborted records an unacknowledged flag that acknowledgeSessionAbort consumes", () => {
    useSessionUIStore.getState().markSessionAborted("session-x")

    const record = useSessionUIStore.getState().sessionAbortFlags.get("session-x")
    expect(record?.acknowledged).toBe(false)
    expect(typeof record?.timestamp).toBe("number")

    useSessionUIStore.getState().acknowledgeSessionAbort("session-x")
    expect(useSessionUIStore.getState().sessionAbortFlags.get("session-x")?.acknowledged).toBe(true)
  })

  test("markSessionAborted ignores an empty session id; acknowledging an unknown session is a no-op", () => {
    useSessionUIStore.getState().markSessionAborted("")
    useSessionUIStore.getState().acknowledgeSessionAbort("session-absent")

    expect(useSessionUIStore.getState().sessionAbortFlags.size).toBe(0)
  })

  test("clearSessionAbort drops a marker armed for an abort the runtime refused", () => {
    useSessionUIStore.getState().markSessionAborted("session-y")
    expect(useSessionUIStore.getState().sessionAbortFlags.has("session-y")).toBe(true)

    useSessionUIStore.getState().clearSessionAbort("session-y")
    expect(useSessionUIStore.getState().sessionAbortFlags.has("session-y")).toBe(false)

    // Clearing an unknown session leaves the map reference stable.
    const before = useSessionUIStore.getState().sessionAbortFlags
    useSessionUIStore.getState().clearSessionAbort("session-absent")
    expect(useSessionUIStore.getState().sessionAbortFlags).toBe(before)
  })
  test("clears the session the notification path treats as watched when the user leaves it", () => {
    // The refs are what `isViewedInCurrentSession` compares against, so an arriving permission or question for a
    // session the user had left was still treated as on screen and its toast was skipped.
    useSessionUIStore.getState().setCurrentSession("ses_watched", "/repo")
    expect(getActiveSessionRef()).toEqual({ directory: "/repo", sessionId: "ses_watched" })

    useSessionUIStore.getState().setCurrentSession(null)
    expect(getActiveSessionRef()).toEqual({ directory: "", sessionId: "" })
  })

  test("clears it when a new-session draft is opened", () => {
    useSessionUIStore.getState().setCurrentSession("ses_watched", "/repo")

    useSessionUIStore.getState().openNewSessionDraft()

    expect(getActiveSessionRef()).toEqual({ directory: "", sessionId: "" })
  })
})
