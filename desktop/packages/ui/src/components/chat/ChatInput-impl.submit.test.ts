import { readFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { describe, expect, test, vi } from "vitest"
import { parseChatSlashCommand } from "./chatInputSlashCommand"

// Execute the production submit handler without mounting the portfolio and runtime UI.
// TypeScript finds the function so these tests exercise its real awaits and recovery paths.
async function loadSubmit(dependencies: Record<string, unknown>) {
  const source = await readFile(path.resolve(__dirname, "ChatInput-impl.tsx"), "utf8")
  const ast = ts.createSourceFile("ChatInput-impl.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler: ts.Expression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleSubmit") handler = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!handler) throw new Error("Production submit handler not found")
  const compiled = ts.transpileModule(`const handleSubmit = ${handler.getText(ast)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(dependencies), `${compiled}; return handleSubmit`)(
    ...Object.values(dependencies),
  ) as () => Promise<void>
}

function createHarness(command: string) {
  const files = [{ id: "attachment", name: "notes.txt", mime: "text/plain", data: "notes" }]
  const state = { currentSessionId: null as string | null, attachedFiles: files }
  const storedDrafts = new Map<string | null, string>()
  const messageRef = { current: `/${command}` }
  const sent = vi.fn().mockResolvedValue(undefined)
  const renderMagicPrompt = vi.fn().mockResolvedValue("Generated prompt")
  const toastError = vi.fn()
  const dependencies = {
    workSendDisabled: false,
    toast: { error: toastError },
    t: (key: string) => key,
    getCurrentInputSnapshot: () => ({ message: messageRef.current, hasContent: Boolean(messageRef.current) }),
    queuedMessages: [],
    hasQueuedMessages: false,
    currentSessionId: null,
    newSessionDraftOpen: true,
    currentProviderId: "provider",
    currentModelId: "model",
    currentAgentName: "agent",
    currentVariant: undefined,
    inputMode: "normal",
    parseChatSlashCommand,
    useSkillsStore: { getState: () => ({ skills: [] }) },
    consumePendingSyntheticParts: () => [],
    collectInlineSkillMentions: () => [],
    agents: [],
    parseAgentMentions: (text: string) => ({ sanitizedText: text }),
    extractInlineFileMentions: (text: string) => ({ sanitizedText: text, attachments: [] }),
    sanitizeAttachmentsForSend: (attachments: unknown[]) => attachments,
    sendableAttachedFiles: files,
    attachedFiles: files,
    inlineCommentSessionKey: null,
    linkedIssue: null,
    linkedPr: null,
    buildSkillMentionInstruction: () => null,
    confirmedMentionsRef: { current: new Set(["notes.txt"]) },
    setMessage: (text: string) => {
      messageRef.current = text
    },
    messageRef,
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
    useInputStore: {
      getState: () => ({
        setAttachedFiles: (value: typeof files) => {
          state.attachedFiles = value
        },
      }),
    },
    useSessionUIStore: { getState: () => state },
    sessionActions: { waitForConnectionOrThrow: vi.fn().mockResolvedValue(undefined) },
    renderMagicPrompt,
    sendMessage: sent,
    scrollToBottom: vi.fn(),
  }
  return { dependencies, state, storedDrafts, messageRef, sent, renderMagicPrompt, toastError, files }
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
      expect(h.sent.mock.calls[0][9]).toEqual({ sessionId: undefined, fromNewSessionDraft: true })
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
})
