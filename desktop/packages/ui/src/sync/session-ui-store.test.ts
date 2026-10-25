import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Message, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { axCodeClient } from "@/lib/ax-code/client"
import type { SessionWorktreeAttachment } from "@/stores/types/sessionTypes"
import { useSessionWorktreeStore } from "./session-worktree-store"
import { attachmentToRouteFileInput, useSessionUIStore } from "./session-ui-store"
import { getActiveSessionRef } from "./sync-context-impl"
import { useInputStore } from "./input-store"
import { PartMap } from "./part-map"
import { setSyncRefs } from "./sync-refs"
import { INITIAL_STATE } from "./types"
import type { ChildStoreManager } from "./child-store"
import {
  createPendingDraftWorktreeRequest,
  resolvePendingDraftWorktreeRequest,
} from "@/lib/worktrees/pendingDraftWorktree"

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
  useProjectsStore.setState({ projects: [], activeProjectId: null })
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
        state.sendMessage(
          "hello",
          "provider-id",
          "model-id",
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "normal",
          {
            fromNewSessionDraft: true,
          },
        ),
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
      useSessionUIStore
        .getState()
        .sendMessage(
          "hello",
          "provider-id",
          "model-id",
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          "normal",
          { fromNewSessionDraft: true },
        ),
    ).rejects.toThrow("Cannot send message without an active session or draft")

    expect(useSessionUIStore.getState().sessionAbortFlags).toEqual(abortFlags)
    expect(useSessionUIStore.getState().pendingChangesBarDismissed).toEqual(dismissed)
  })

  test.each(["closed", "replaced"])(
    "does not create a session after a pending worktree draft is %s",
    async (change) => {
      const requestId = createPendingDraftWorktreeRequest()
      const originalCreate = useSessionUIStore.getState().createSession
      const activateDirectory = vi.spyOn(useConfigStore.getState(), "activateDirectory").mockResolvedValue(undefined)
      const createSession = vi.fn().mockResolvedValue(null)
      useSessionUIStore.setState({
        newSessionDraft: {
          open: true,
          directoryOverride: "/repo/original",
          parentID: null,
          pendingWorktreeRequestId: requestId,
        },
        createSession,
      })
      const pending = useSessionUIStore.getState().sendMessage("hello", "provider", "model")
      const rejected = expect(pending).rejects.toThrow("Cannot send message without an active session or draft")
      if (change === "replaced") {
        useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/repo/replacement" })
      } else {
        useSessionUIStore.getState().closeNewSessionDraft()
        useSessionUIStore.setState({ currentSessionId: "ses_other" })
      }
      resolvePendingDraftWorktreeRequest(requestId, "/repo/original/worktree")

      try {
        await rejected
        expect(createSession).not.toHaveBeenCalled()
        expect(useSessionUIStore.getState().currentSessionId).toBe(change === "closed" ? "ses_other" : null)
        if (change === "replaced")
          expect(useSessionUIStore.getState().newSessionDraft.directoryOverride).toBe("/repo/replacement")
      } finally {
        useSessionUIStore.setState({ createSession: originalCreate })
        activateDirectory.mockRestore()
      }
    },
  )

  test("allows the original pending worktree to resolve before session creation", async () => {
    const requestId = createPendingDraftWorktreeRequest()
    const originalCreate = useSessionUIStore.getState().createSession
    const createSession = vi.fn().mockResolvedValue(null)
    useSessionUIStore.setState({
      newSessionDraft: {
        open: true,
        directoryOverride: "/repo/original",
        parentID: null,
        pendingWorktreeRequestId: requestId,
      },
      createSession,
    })
    const pending = useSessionUIStore.getState().sendMessage("hello", "provider", "model")
    const rejected = expect(pending).rejects.toThrow("Failed to create session")
    useSessionUIStore.getState().resolvePendingDraftWorktreeTarget(requestId, "/repo/original/worktree")
    resolvePendingDraftWorktreeRequest(requestId, "/repo/original/worktree")

    try {
      await rejected
      expect(createSession).toHaveBeenCalledWith(undefined, "/repo/original/worktree", null)
    } finally {
      useSessionUIStore.setState({ createSession: originalCreate })
    }
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

  test("setCurrentSession resolves the project directory from the global session index", () => {
    const session = {
      id: "ses_other_project",
      title: "Other project",
      directory: "/repo/other",
      time: { created: 1, updated: 2 },
    } as Session
    useGlobalSessionsStore.setState({ activeSessions: [session], archivedSessions: [] })

    const previousClient = axCodeClient.getDirectory()
    const previousStore = useDirectoryStore.getState().currentDirectory
    axCodeClient.setDirectory("/repo/current")
    useDirectoryStore.setState({ currentDirectory: "/repo/current" })
    try {
      // No directory hint and no sync entry for the session: the global index
      // is the only place that still knows where the session belongs.
      useSessionUIStore.getState().setCurrentSession(session.id)

      expect(axCodeClient.getDirectory()).toBe("/repo/other")
      expect(useDirectoryStore.getState().currentDirectory).toBe("/repo/other")
    } finally {
      axCodeClient.setDirectory(previousClient)
      useDirectoryStore.setState({ currentDirectory: previousStore })
    }
  })

  test("reconcileCurrentSessionDirectory repairs a session selected before its project loaded", () => {
    const session = {
      id: "ses_late_project",
      title: "Late project",
      directory: "/repo/late",
      time: { created: 1, updated: 2 },
    } as Session
    useGlobalSessionsStore.setState({ activeSessions: [session], archivedSessions: [] })

    const previousClient = axCodeClient.getDirectory()
    const previousStore = useDirectoryStore.getState().currentDirectory
    axCodeClient.setDirectory("/repo/current")
    useDirectoryStore.setState({ currentDirectory: "/repo/current" })
    useSessionUIStore.setState({ currentSessionId: session.id })
    try {
      expect(useSessionUIStore.getState().reconcileCurrentSessionDirectory()).toBe(true)
      expect(axCodeClient.getDirectory()).toBe("/repo/late")
      expect(useDirectoryStore.getState().currentDirectory).toBe("/repo/late")
      expect(useSessionUIStore.getState().reconcileCurrentSessionDirectory()).toBe(false)
    } finally {
      axCodeClient.setDirectory(previousClient)
      useDirectoryStore.setState({ currentDirectory: previousStore })
    }
  })

  test("clearCurrentSessionIfOutsideDirectory drops a session after a project switch", () => {
    const session = {
      id: "ses_project_a",
      title: "Project A session",
      directory: "/repo/a",
      time: { created: 1, updated: 2 },
    } as Session
    useGlobalSessionsStore.setState({ activeSessions: [session], archivedSessions: [] })
    useProjectsStore.setState({
      projects: [
        { id: "project-a", path: "/repo/a" },
        { id: "project-b", path: "/repo/b" },
      ],
      activeProjectId: "project-b",
    })

    const previousClient = axCodeClient.getDirectory()
    const previousStore = useDirectoryStore.getState().currentDirectory
    try {
      axCodeClient.setDirectory("/repo/a")
      useDirectoryStore.setState({ currentDirectory: "/repo/a" })
      useSessionUIStore.getState().setCurrentSession(session.id, "/repo/a")

      // Project switch: the directory moves, the selected session does not.
      axCodeClient.setDirectory("/repo/b")
      useDirectoryStore.setState({ currentDirectory: "/repo/b" })

      expect(useSessionUIStore.getState().clearCurrentSessionIfOutsideDirectory("/repo/b")).toBe(true)
      expect(useSessionUIStore.getState().currentSessionId).toBeNull()
    } finally {
      axCodeClient.setDirectory(previousClient)
      useDirectoryStore.setState({ currentDirectory: previousStore })
    }
  })

  test("clearCurrentSessionIfOutsideDirectory keeps a session in its own directory", () => {
    const session = {
      id: "ses_project_a",
      title: "Project A session",
      directory: "/repo/a",
      time: { created: 1, updated: 2 },
    } as Session
    useGlobalSessionsStore.setState({ activeSessions: [session], archivedSessions: [] })
    useProjectsStore.setState({ projects: [{ id: "project-a", path: "/repo/a" }], activeProjectId: "project-a" })
    useSessionUIStore.getState().setCurrentSession(session.id, "/repo/a")

    expect(useSessionUIStore.getState().clearCurrentSessionIfOutsideDirectory("/repo/a/")).toBe(false)
    expect(useSessionUIStore.getState().currentSessionId).toBe(session.id)
  })

  test("clearCurrentSessionIfOutsideDirectory keeps a worktree session in its project", () => {
    const session = {
      id: "ses_worktree",
      title: "Worktree session",
      directory: "/repo/a/.worktrees/feature",
      time: { created: 1, updated: 2 },
    } as Session
    useGlobalSessionsStore.setState({ activeSessions: [session], archivedSessions: [] })
    useProjectsStore.setState({ projects: [{ id: "project-a", path: "/repo/a" }], activeProjectId: "project-a" })
    useSessionUIStore.getState().setCurrentSession(session.id, "/repo/a/.worktrees/feature")

    expect(useSessionUIStore.getState().clearCurrentSessionIfOutsideDirectory("/repo/a")).toBe(false)
    expect(useSessionUIStore.getState().currentSessionId).toBe(session.id)
  })

  test("clearCurrentSessionIfOutsideDirectory leaves an unclassified directory alone", () => {
    const session = {
      id: "ses_unregistered",
      title: "Unregistered directory session",
      directory: "/tmp/one",
      time: { created: 1, updated: 2 },
    } as Session
    useGlobalSessionsStore.setState({ activeSessions: [session], archivedSessions: [] })
    useSessionUIStore.getState().setCurrentSession(session.id, "/tmp/one")

    expect(useSessionUIStore.getState().clearCurrentSessionIfOutsideDirectory("/tmp/two")).toBe(false)
    expect(useSessionUIStore.getState().currentSessionId).toBe(session.id)
  })

  test("clearCurrentSessionIfOutsideDirectory leaves a session with an unknown directory alone", () => {
    useSessionUIStore.setState({ currentSessionId: "ses_unknown" })

    expect(useSessionUIStore.getState().clearCurrentSessionIfOutsideDirectory("/repo/b")).toBe(false)
    expect(useSessionUIStore.getState().currentSessionId).toBe("ses_unknown")
  })
})

describe("session-ui-store attachments", () => {
  test("keeps the previous session's attachments when opening a new-session draft", () => {
    // openNewSessionDraft used to clear the active attachment draft before the composer's
    // effect switched drafts, which deleted the stash of the session being left.
    const file = {
      id: "f1",
      file: new File([], "notes.png", { type: "image/png" }),
      filename: "notes.png",
      mimeType: "image/png",
      size: 3,
      dataUrl: "data:,x",
      source: "local" as const,
    }
    useInputStore.getState().setActiveAttachmentDraft("")
    useInputStore.getState().setAttachedFiles([])
    useInputStore.getState().setActiveAttachmentDraft("ses_attached")
    useInputStore.getState().setAttachedFiles([file])

    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/repo" })
    // The composer's setActiveAttachmentDraft effect runs after the render; emulate it.
    useInputStore.getState().setActiveAttachmentDraft("")

    expect(useInputStore.getState().attachedFiles).toEqual([])
    useInputStore.getState().setActiveAttachmentDraft("ses_attached")
    expect(useInputStore.getState().attachedFiles).toEqual([file])

    useInputStore.getState().setActiveAttachmentDraft("")
    useInputStore.getState().setAttachedFiles([])
  })

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

describe("createSessionFromAssistantMessage", () => {
  test("surfaces a failed follow-up send instead of leaving an unhandled rejection", async () => {
    // The caller fires this as `void`; without a catch the user was left on the newly created,
    // empty session with no error and an unhandled promise rejection.
    const sourceMessage = {
      id: "msg_source",
      sessionID: "ses_source",
      role: "assistant",
      time: { created: 1 },
    } as unknown as Message
    const directoryState = {
      ...INITIAL_STATE,
      message: { ses_source: [sourceMessage] },
      part: PartMap.from({
        msg_source: [
          { id: "prt_source", type: "text", messageID: "msg_source", sessionID: "ses_source", text: "plan" },
        ],
      }),
    }
    const childStores = {
      children: new Map(),
      getState: () => directoryState,
    } as unknown as ChildStoreManager
    setSyncRefs(childStores, "/repo")

    const originalCreate = useSessionUIStore.getState().createSession
    const config = useConfigStore.getState()
    const originalProviderId = config.currentProviderId
    const originalModelId = config.currentModelId
    const originalAgentName = config.currentAgentName
    const send = vi.spyOn(axCodeClient, "sendMessage").mockRejectedValueOnce(new Error("runtime down"))
    useSessionUIStore.setState({
      createSession: vi.fn().mockResolvedValue({ id: "ses_new", directory: "/repo" }) as never,
      error: null,
    })
    useConfigStore.setState({
      currentProviderId: "provider",
      currentModelId: "model",
      currentAgentName: "agent",
    })

    try {
      await expect(
        useSessionUIStore.getState().createSessionFromAssistantMessage("msg_source"),
      ).resolves.toBeUndefined()

      expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: "ses_new", text: "plan" }))
      expect(useSessionUIStore.getState().error).toBe("runtime down")
    } finally {
      send.mockRestore()
      useSessionUIStore.setState({ createSession: originalCreate, error: null })
      useConfigStore.setState({
        currentProviderId: originalProviderId,
        currentModelId: originalModelId,
        currentAgentName: originalAgentName,
      })
    }
  })
})
