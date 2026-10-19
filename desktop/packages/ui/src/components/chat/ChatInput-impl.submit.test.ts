import { readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { describe, expect, test, vi } from "vitest"
import { parseChatSlashCommand } from "./chatInputSlashCommand"
import { isQueueableMessage } from "./queuedMessageRouting"
import { promptTextToRemember } from "@/lib/promptHistoryRecall"

type LoadedHandler = (options?: { queuedOnly?: boolean; queuedMessageId?: string }) => Promise<void>

// Execute a production handler without mounting the portfolio and runtime UI.
// TypeScript finds the function so these tests exercise its real awaits and recovery paths.
async function loadHandler(name: string, dependencies: Record<string, unknown>): Promise<LoadedHandler> {
  const source = await readFile(path.resolve(__dirname, "ChatInput-impl.tsx"), "utf8")
  const ast = ts.createSourceFile("ChatInput-impl.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler: ts.Expression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) handler = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!handler) throw new Error(`Production handler ${name} not found`)
  const compiled = ts.transpileModule(`const ${name} = ${handler.getText(ast)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(dependencies), `${compiled}; return ${name}`)(
    ...Object.values(dependencies),
  ) as LoadedHandler
}

const loadSubmit = (dependencies: Record<string, unknown>) => loadHandler("handleSubmit", dependencies)

type TestAttachment = Record<string, unknown>

type HarnessOptions = {
  message?: string
  sessionId?: string | null
  draftOpen?: boolean
  attachments?: TestAttachment[]
  queueEntries?: TestAttachment[]
}

function createHarness(command: string, options: HarnessOptions = {}) {
  const files: TestAttachment[] = options.attachments ?? [
    { id: "attachment", name: "notes.txt", mime: "text/plain", data: "notes" },
  ]
  const draft = {
    open: options.draftOpen ?? true,
    selectedProjectId: "project-a",
    directoryOverride: "/projects/a",
    bootstrapPendingDirectory: null as string | null,
    pendingWorktreeRequestId: null as string | null,
  }
  const queueEntries = options.queueEntries ?? []
  const queueState = {
    queuedMessages: (options.sessionId ? { [options.sessionId]: queueEntries } : {}) as Record<string, TestAttachment[]>,
  }
  const state = {
    currentSessionId: (options.sessionId ?? null) as string | null,
    attachedFiles: files,
    attachmentsByDraft: {} as Record<string, TestAttachment[]>,
    newSessionDraft: draft,
    sessionAbortFlags: new Map<string, { timestamp: number; acknowledged: boolean }>(),
    getDirectoryForSession: () => "/projects/a",
  }
  const storedDrafts = new Map<string | null, string>()
  const messageRef = { current: options.message ?? `/${command}` }
  const sent = vi.fn().mockResolvedValue(undefined)
  const renderMagicPrompt = vi.fn().mockResolvedValue("Generated prompt")
  const toastError = vi.fn()
  const getGlobalSyncSessionStatus = vi.fn((): { type: string } | undefined => ({ type: "idle" }))
  const isQueuedAutoSendHeld = vi.fn(() => false)
  // Mirror the real append semantics so a handler can find the entry it just queued.
  const addToQueue = vi.fn((sessionId: string, message: TestAttachment) => {
    const queue = queueState.queuedMessages[sessionId] ?? []
    queueState.queuedMessages = {
      ...queueState.queuedMessages,
      [sessionId]: [...queue, { id: `queued-${queue.length + 1}`, createdAt: 1, ...message }],
    }
    return true
  })
  const normalizePath = (value?: string | null): string | null => {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const normalized = trimmed.replace(/\\/g, "/")
    return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized
  }
  const inputStore = {
    getState: () => ({
      attachedFiles: state.attachedFiles,
      attachmentsByDraft: state.attachmentsByDraft,
      setAttachedFiles: (value: TestAttachment[]) => {
        state.attachedFiles = value
      },
    }),
    setState: (updater: (value: typeof state) => Partial<typeof state>) => {
      const next = updater(state)
      if (next.attachmentsByDraft) state.attachmentsByDraft = next.attachmentsByDraft
      if (next.attachedFiles) state.attachedFiles = next.attachedFiles
    },
  }
  const dependencies = {
    workSendDisabled: false,
    toast: { error: toastError },
    t: (key: string) => key,
    getCurrentInputSnapshot: () => ({
      message: messageRef.current,
      hasContent: Boolean(messageRef.current) || state.attachedFiles.length > 0,
    }),
    queuedMessages: queueEntries,
    hasQueuedMessages: queueEntries.length > 0,
    currentSessionId: state.currentSessionId,
    newSessionDraftOpen: draft.open,
    newSessionDraft: draft,
    currentDirectory: "/projects/a",
    currentProviderId: "provider",
    currentModelId: "model",
    currentAgentName: "agent",
    currentVariant: undefined,
    inputMode: "normal",
    parseChatSlashCommand,
    isQueueableMessage,
    useSkillsStore: { getState: () => ({ skills: [] }) },
    consumePendingSyntheticParts: () => [],
    collectInlineSkillMentions: () => [],
    agents: [],
    parseAgentMentions: (text: string) => ({ sanitizedText: text }),
    extractInlineFileMentions: (text: string) => ({ sanitizedText: text, attachments: [] }),
    sanitizeAttachmentsForSend: (attachments?: TestAttachment[]) => attachments ?? [],
    sendableAttachedFiles: files,
    attachedFiles: files,
    inlineCommentSessionKey: null,
    linkedIssue: null,
    linkedPr: null,
    buildSkillMentionInstruction: () => null,
    confirmedMentionsRef: { current: new Set(["notes.txt"]) },
    pendingPastedAttachmentReadsRef: { current: new Set<Promise<void>>() },
    pendingLateQueueDispatchRef: { current: null as string | null },
    queueMessageInFlightRef: { current: false },
    QUEUED_ABORT_HOLD_MS: 2000,
    getGlobalSyncSessionStatus,
    isQueuedAutoSendHeld,
    setMessage: (text: string) => {
      messageRef.current = text
    },
    messageRef,
    promptTextToRemember,
    promptHistoryDirectoryRef: { current: "" },
    rememberSubmittedPrompt: vi.fn(),
    exitPromptBrowsing: vi.fn(),
    saveStoredDraft: (id: string | null, text: string) => {
      storedDrafts.set(id, text)
    },
    getStoredDraft: (id: string | null) => storedDrafts.get(id) ?? "",
    saveConfirmedMentions: vi.fn(),
    setHistoryIndex: vi.fn(),
    setDraftMessage: vi.fn(),
    clearAttachedFiles: () => {
      state.attachedFiles = []
    },
    setExpandedInput: vi.fn(),
    isMobile: false,
    restoreConsumedDrafts: vi.fn(),
    useInputStore: inputStore,
    useSessionUIStore: { getState: () => state },
    useMessageQueueStore: {
      getState: () => ({
        queuedMessages: queueState.queuedMessages,
        getQueueForSession: (sessionId: string) => queueState.queuedMessages[sessionId] ?? [],
        assignMessageId: (sessionId: string, queuedMessageId: string, messageId: string) => {
          const currentQueue = queueState.queuedMessages[sessionId] ?? []
          const index = currentQueue.findIndex((message) => message.id === queuedMessageId)
          if (index === -1) return
          const nextQueue = currentQueue.slice()
          nextQueue[index] = { ...nextQueue[index], messageId }
          queueState.queuedMessages = { ...queueState.queuedMessages, [sessionId]: nextQueue }
        },
        removeFromQueue: (sessionId: string, queuedMessageId: string) => {
          const currentQueue = queueState.queuedMessages[sessionId] ?? []
          queueState.queuedMessages = {
            ...queueState.queuedMessages,
            [sessionId]: currentQueue.filter((message) => message.id !== queuedMessageId),
          }
        },
      }),
      setState: (updater: (value: typeof queueState) => typeof queueState) => {
        const next = updater(queueState)
        if (next?.queuedMessages) queueState.queuedMessages = next.queuedMessages
      },
    },
    removeFromQueue: (sessionId: string, queuedMessageId: string) => {
      const currentQueue = queueState.queuedMessages[sessionId] ?? []
      queueState.queuedMessages = {
        ...queueState.queuedMessages,
        [sessionId]: currentQueue.filter((message) => message.id !== queuedMessageId),
      }
    },
    clearQueue: vi.fn(),
    addToQueue,
    consumeDrafts: () => [],
    appendInlineComments: (text: string) => text,
    getNewSessionDraftRevision: () => 0,
    ascendingId: (prefix: string) => `${prefix}_test`,
    sessionActions: { waitForConnectionOrThrow: vi.fn().mockResolvedValue(undefined) },
    renderMagicPrompt,
    sendMessage: sent,
    scrollToBottom: vi.fn(),
    handleSubmitRef: { current: vi.fn().mockResolvedValue(undefined) },
    textareaRef: { current: null },
    normalizePath,
    INVALID_SEND_TARGET_MESSAGE: "Cannot send message without an active session or draft",
    fetchResponseStyleInstruction: vi.fn().mockResolvedValue(null),
    wrapSystemReminder: (text: string) => text,
    hasUserMessages: () => true,
    useSnippetsStore: { getState: () => ({ expandText: async (text: string) => text }) },
    filterMissingInlineAttachments: async (attachments: TestAttachment[]) => attachments,
    isInlineServerAttachment: () => false,
    axCodeClient: { listLocalDirectory: vi.fn().mockResolvedValue([]) },
    recordRecentPrompt: vi.fn(),
    setLinkedIssue: vi.fn(),
    setLinkedPr: vi.fn(),
    React: { useCallback: (callback: unknown) => callback },
  }
  return {
    dependencies,
    state,
    storedDrafts,
    messageRef,
    sent,
    renderMagicPrompt,
    toastError,
    addToQueue,
    queueState,
    files,
    handleSubmitRef: dependencies.handleSubmitRef,
    getGlobalSyncSessionStatus,
    isQueuedAutoSendHeld,
    pendingLateQueueDispatchRef: dependencies.pendingLateQueueDispatchRef,
  }
}

describe("magic-command submit races", () => {
  test.each(["workspace-review", "plan", "plan-feature", "catch-up", "debug", "weigh", "explore"])(
    "%s keeps its draft target when the user selects a session during prompt rendering",
    async (command) => {
      const h = createHarness(command)
      let resolvePrompt!: (value: string) => void
      h.renderMagicPrompt.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolvePrompt = resolve
          }),
      )
      const submit = await loadSubmit(h.dependencies)
      const pending = submit()
      await vi.waitFor(() => expect(h.renderMagicPrompt).toHaveBeenCalled())
      h.state.currentSessionId = "other-session"
      resolvePrompt("Visible prompt")
      await pending

      expect(h.sent).toHaveBeenCalledOnce()
      expect(h.sent.mock.calls[0][9]).toEqual({ sessionId: undefined, fromNewSessionDraft: true, draftRevision: 0 })
    },
  )

  test("restores a failed magic command and its attachments", async () => {
    const h = createHarness("explore")
    h.renderMagicPrompt.mockRejectedValue(new Error("Prompt rendering failed"))
    const submit = await loadSubmit(h.dependencies)
    await submit()
    expect(h.messageRef.current).toBe("/explore")
    expect(h.storedDrafts.get(null)).toBe("/explore")
    expect(h.state.attachedFiles).toEqual(h.files)
    expect(h.sent).not.toHaveBeenCalled()
    expect(h.toastError).toHaveBeenCalledWith("Prompt rendering failed")
  })

  test("persists the failed draft command when another session is on screen", async () => {
    const h = createHarness("explore")
    let rejectPrompt!: (error: Error) => void
    h.renderMagicPrompt.mockImplementationOnce(
      () =>
        new Promise<string>((_, reject) => {
          rejectPrompt = reject
        }),
    )
    const submit = await loadSubmit(h.dependencies)
    const pending = submit()
    await vi.waitFor(() => expect(h.renderMagicPrompt).toHaveBeenCalled())
    h.state.currentSessionId = "other-session"
    h.messageRef.current = "New session input"
    rejectPrompt(new Error("Prompt rendering failed"))
    await pending
    expect(h.messageRef.current).toBe("New session input")
    expect(h.storedDrafts.get(null)).toBe("/explore")
  })

  test("keeps text typed in the same composer while the failed command was pending", async () => {
    const h = createHarness("explore")
    h.renderMagicPrompt.mockImplementationOnce(async () => {
      h.messageRef.current = "New input"
      throw new Error("Prompt rendering failed")
    })
    await (
      await loadSubmit(h.dependencies)
    )()
    expect(h.messageRef.current).toBe("New input")
  })

  test("aborts a submit whose session changed while pasted attachments were reading", async () => {
    const h = createHarness("explore")
    let resolveRead!: () => void
    h.dependencies.pendingPastedAttachmentReadsRef.current.add(
      new Promise<void>((resolve) => {
        resolveRead = resolve
      }),
    )
    const submit = await loadSubmit(h.dependencies)
    const pending = submit()
    // The composer switched sessions while the pasted file was still reading.
    h.state.currentSessionId = "other-session"
    resolveRead()
    await pending
    expect(h.sent).not.toHaveBeenCalled()
  })

  test("refuses to send when the draft project changes while the prompt renders", async () => {
    const h = createHarness("plan")
    let resolvePrompt!: (value: string) => void
    h.renderMagicPrompt.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolvePrompt = resolve
        }),
    )
    const submit = await loadSubmit(h.dependencies)
    const pending = submit()
    await vi.waitFor(() => expect(h.renderMagicPrompt).toHaveBeenCalled())
    // The draft project switcher retargets the open draft without changing its
    // lifecycle revision, which used to let the rendered prompt go to project B.
    h.state.newSessionDraft.selectedProjectId = "project-b"
    h.state.newSessionDraft.directoryOverride = "/projects/b"
    resolvePrompt("Visible prompt")
    await pending

    expect(h.sent).not.toHaveBeenCalled()
    expect(h.toastError).toHaveBeenCalledWith("Cannot send message without an active session or draft")
    expect(h.storedDrafts.get(null)).toBe("/plan")
  })

  test("refuses an ordinary draft send when the target changed before dispatch", async () => {
    const h = createHarness("explore", { message: "hello from project A" })
    // The ordinary send's response-style await is where the user retargets the draft.
    h.dependencies.fetchResponseStyleInstruction = vi.fn(async () => {
      h.state.newSessionDraft.selectedProjectId = "project-b"
      h.state.newSessionDraft.directoryOverride = "/projects/b"
      return null
    })
    const submit = await loadSubmit(h.dependencies)
    await submit()

    await vi.waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith("Cannot send message without an active session or draft"),
    )
    expect(h.sent).not.toHaveBeenCalled()
    expect(h.messageRef.current).toBe("hello from project A")
  })
})

describe("pasted attachment reads settle before the payload is built", () => {
  const pastedAttachment: TestAttachment = {
    id: "pasted",
    filename: "image-1.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
    source: "local",
    size: 4,
  }

  test("sends a pasted image whose read settled while the submit was waiting", async () => {
    // The render closure the submit started with has an empty attachment list;
    // the file lands in the store while the submit waits for its read.
    const h = createHarness("explore", { attachments: [] })
    h.messageRef.current = "Look at [image-1.png]"
    let resolveRead!: () => void
    h.dependencies.pendingPastedAttachmentReadsRef.current.add(
      new Promise<void>((resolve) => {
        resolveRead = resolve
      }),
    )
    const submit = await loadSubmit(h.dependencies)
    const pending = submit()
    h.state.attachedFiles = [pastedAttachment]
    resolveRead()
    await pending

    expect(h.sent).toHaveBeenCalledOnce()
    expect(h.sent.mock.calls[0][4]).toEqual([pastedAttachment])
    // The image that was sent must leave the composer; the stale closure skipped
    // the clear because it believed nothing was attached.
    expect(h.state.attachedFiles).toEqual([])
  })

  test("queues a pasted image whose read settled while the queue handler was waiting", async () => {
    const h = createHarness("explore", { attachments: [], sessionId: "session-a", draftOpen: false })
    h.messageRef.current = "Look at [image-1.png]"
    let resolveRead!: () => void
    h.dependencies.pendingPastedAttachmentReadsRef.current.add(
      new Promise<void>((resolve) => {
        resolveRead = resolve
      }),
    )
    const queueMessage = await loadHandler("handleQueueMessage", h.dependencies)
    const pending = queueMessage()
    h.state.attachedFiles = [pastedAttachment]
    resolveRead()
    await pending

    expect(h.addToQueue).toHaveBeenCalledOnce()
    expect(h.addToQueue.mock.calls[0][0]).toBe("session-a")
    expect(h.addToQueue.mock.calls[0][1].attachments).toEqual([pastedAttachment])
    expect(h.state.attachedFiles).toEqual([])
  })

  test("files a failed draft send's attachments under the empty draft slot", async () => {
    const h = createHarness("explore", { message: "hello from the draft" })
    h.sent.mockImplementation(async () => {
      // The user moved to another session while the send was failing.
      h.state.currentSessionId = "other-session"
      throw new Error("Failed to create session")
    })
    const submit = await loadSubmit(h.dependencies)
    await submit()

    // A draft send has no captured session id, so its draft slot is keyed "".
    await vi.waitFor(() => expect(h.state.attachmentsByDraft[""]).toEqual(h.files))
    expect(h.storedDrafts.get(null)).toBe("hello from the draft")
  })
})

describe("queue presses while a pasted read is settling", () => {
  test("queues synchronously when no read is pending", async () => {
    const h = createHarness("explore", { message: "hello", sessionId: "session-a", draftOpen: false })
    const queueMessage = await loadHandler("handleQueueMessage", h.dependencies)
    const pending = queueMessage()

    // No await on this path: the entry exists before a busy -> idle edge can pass it.
    expect(h.addToQueue).toHaveBeenCalledOnce()
    await pending
  })

  test("drops a second press while the first waits for the same read", async () => {
    const h = createHarness("explore", { message: "hello", sessionId: "session-a", draftOpen: false })
    let resolveRead!: () => void
    h.dependencies.pendingPastedAttachmentReadsRef.current.add(
      new Promise<void>((resolve) => {
        resolveRead = resolve
      }),
    )
    const queueMessage = await loadHandler("handleQueueMessage", h.dependencies)
    const first = queueMessage()
    const second = queueMessage()
    resolveRead()
    await Promise.all([first, second])

    // Both continuations would otherwise see the pre-clear composer and queue twice.
    expect(h.addToQueue).toHaveBeenCalledOnce()
  })

  test("marks the late entry for dispatch after the idle edge was spent", async () => {
    const h = createHarness("explore", { message: "hello", sessionId: "session-a", draftOpen: false })
    let resolveRead!: () => void
    h.dependencies.pendingPastedAttachmentReadsRef.current.add(
      new Promise<void>((resolve) => {
        resolveRead = resolve
      }),
    )
    const queueMessage = await loadHandler("handleQueueMessage", h.dependencies)
    const pending = queueMessage()
    // The turn ends while the read is still pending; the empty-queue edge is spent.
    h.getGlobalSyncSessionStatus.mockReturnValue({ type: "idle" })
    resolveRead()
    await pending

    expect(h.addToQueue).toHaveBeenCalledOnce()
    expect(h.pendingLateQueueDispatchRef.current).toBe("queued-1")
  })

  test("dispatches the late entry through the chip path once its render lands", async () => {
    const queuedEntry = { id: "queued-1", content: "hello", createdAt: 1 }
    const h = createHarness("explore", {
      message: "",
      sessionId: "session-a",
      draftOpen: false,
      queueEntries: [queuedEntry],
    })
    h.pendingLateQueueDispatchRef.current = "queued-1"
    const dispatchLate = await loadHandler("dispatchLateQueuedMessage", h.dependencies)
    dispatchLate()

    expect(h.handleSubmitRef.current).toHaveBeenCalledWith({ queuedOnly: true, queuedMessageId: "queued-1" })
    expect(h.pendingLateQueueDispatchRef.current).toBeNull()
  })

  test("leaves the late entry queued while the session is still busy", async () => {
    const queuedEntry = { id: "queued-1", content: "hello", createdAt: 1 }
    const h = createHarness("explore", {
      message: "",
      sessionId: "session-a",
      draftOpen: false,
      queueEntries: [queuedEntry],
    })
    h.pendingLateQueueDispatchRef.current = "queued-1"
    h.getGlobalSyncSessionStatus.mockReturnValue({ type: "busy" })
    const dispatchLate = await loadHandler("dispatchLateQueuedMessage", h.dependencies)
    dispatchLate()

    // The next busy -> idle edge owns the entry; the handler must not send mid-turn.
    expect(h.handleSubmitRef.current).not.toHaveBeenCalled()
  })

  test("does not dispatch an entry the auto-sender already removed", async () => {
    const h = createHarness("explore", { message: "", sessionId: "session-a", draftOpen: false })
    h.pendingLateQueueDispatchRef.current = "queued-1"
    const dispatchLate = await loadHandler("dispatchLateQueuedMessage", h.dependencies)
    dispatchLate()

    expect(h.handleSubmitRef.current).not.toHaveBeenCalled()
  })
})

describe("manual queue dispatch keeps its retry id", () => {
  test("restores the minted id when the send fails", async () => {
    const queuedEntry = { id: "queued-1", content: "queued prompt", createdAt: 1 }
    const h = createHarness("explore", {
      message: "",
      sessionId: "session-a",
      draftOpen: false,
      queueEntries: [queuedEntry],
    })
    h.sent.mockRejectedValue(new Error("connection lost"))
    const submit = await loadSubmit(h.dependencies)
    await submit({ queuedOnly: true, queuedMessageId: "queued-1" })

    // assignMessageId replaced the store entry; the failure restore must reinsert
    // the same object shape, id included, or the retry sends the prompt twice.
    expect(h.sent.mock.calls[0][9]).toMatchObject({ messageId: "msg_test" })
    await vi.waitFor(() => expect(h.queueState.queuedMessages["session-a"]).toHaveLength(1))
    expect(h.queueState.queuedMessages["session-a"][0].messageId).toBe("msg_test")
  })
})
