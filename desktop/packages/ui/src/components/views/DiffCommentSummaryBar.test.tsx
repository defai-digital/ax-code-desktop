import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useInlineCommentDraftStore } from "@/stores/useInlineCommentDraftStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"

import { useReviewThreadStore } from "@/stores/useReviewThreadStore"
import { ReviewThreadContentsContext } from "@/components/comments/ReviewThreadAnchorContext"

const harness = vi.hoisted(() => ({ rows: [] as SupervisionRow[] }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => harness.rows }))
vi.mock("@/components/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { DiffCommentSummaryBar } from "./DiffCommentSummaryBar"

const KEY = "draft-key"
const row = (sessionId: string, title: string, directory: string): SupervisionRow => ({
  sessionId,
  title,
  state: "running",
  treeSessionIds: [sessionId],
  projectId: null,
  projectLabel: null,
  directory,
  updatedAt: 0,
  evidence: null,
  goal: null,
})

describe("DiffCommentSummaryBar target", () => {
  const sendMessage = vi.fn(async (): Promise<void> => undefined)

  beforeEach(() => {
    harness.rows = [
      row("ses_a", "Current task", "/repo"),
      row("ses_b", "Other agent", "/repo"),
      row("ses_c", "Elsewhere", "/other"),
    ]
    sendMessage.mockReset()
    useReviewThreadStore.setState({ threadsByDirectory: {} })
    useSessionUIStore.setState({ currentSessionId: "ses_a", sendMessage } as never)
    useInlineCommentDraftStore.setState({
      drafts: {
        [KEY]: [
          {
            id: "d1",
            sessionKey: KEY,
            source: "diff",
            fileLabel: "a.ts",
            startLine: 1,
            endLine: 1,
            side: "modified",
            code: "const a = 1",
            language: "typescript",
            text: "Rename this",
            createdAt: 0,
          },
        ],
      },
    } as never)
  })
  afterEach(cleanup)

  const draw = () =>
    render(
      <I18nProvider>
        <div data-review-changes>
          <DiffCommentSummaryBar sessionKey={KEY} />
        </div>
      </I18nProvider>,
    )

  test("lists sessions of this project, defaults to the current one and sends to the chosen session", async () => {
    draw()
    const select = screen.getByRole("combobox", { name: "Send comments to" }) as HTMLSelectElement
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(["Current task", "Other agent"])
    expect(select.value).toBe("ses_a")
    act(() => {
      select.value = "ses_b"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send to agent" })))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0]?.at(-1)).toEqual({ sessionId: "ses_b" })
    expect(useInlineCommentDraftStore.getState().drafts[KEY] ?? []).toHaveLength(0)
    expect(useReviewThreadStore.getState().threadsByDirectory["/repo"]).toEqual([
      expect.objectContaining({
        id: "d1",
        sessionKey: KEY,
        recipientSessionId: "ses_b",
        fileLabel: "a.ts",
        side: "modified",
        startLine: 1,
        endLine: 1,
        code: "const a = 1",
        text: "Rename this",
        status: "open",
        sentAt: expect.any(Number),
      }),
    ])
  })

  test("a draft review without a current session can still send to a session of the project", async () => {
    useSessionUIStore.setState({ currentSessionId: null } as never)
    draw()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send to agent" })))
    expect(sendMessage.mock.calls[0]?.at(-1)).toEqual({ sessionId: "ses_a" })
  })

  test("no picker when only one session can receive the comments", () => {
    harness.rows = [row("ses_a", "Current task", "/repo")]
    draw()
    expect(screen.queryByRole("combobox", { name: "Send comments to" })).toBeNull()
  })

  test("a choice made for one review does not follow the drafts of another", () => {
    const { rerender } = draw()
    const select = () => screen.getByRole("combobox", { name: "Send comments to" }) as HTMLSelectElement
    act(() => {
      select().value = "ses_b"
      select().dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(select().value).toBe("ses_b")
    useInlineCommentDraftStore.setState({
      drafts: { other: useInlineCommentDraftStore.getState().drafts[KEY] },
    } as never)
    rerender(
      <I18nProvider>
        <div data-review-changes>
          <DiffCommentSummaryBar sessionKey="other" />
        </div>
      </I18nProvider>,
    )
    expect(select().value).toBe("ses_a")
  })

  test("sessions in a worktree of the same project are offered", () => {
    useProjectsStore.setState({
      projects: [{ id: "p1", path: "/repo", label: "Repo", addedAt: 0, lastOpenedAt: 0 }],
    } as never)
    harness.rows = [
      { ...row("ses_a", "Current task", "/repo"), projectId: "p1" },
      { ...row("ses_w", "Worktree agent", "/repo/.worktrees/x"), projectId: "p1" },
      { ...row("ses_c", "Elsewhere", "/other"), projectId: "p2" },
    ]
    draw()
    const select = screen.getByRole("combobox", { name: "Send comments to" }) as HTMLSelectElement
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(["Current task", "Worktree agent"])
    useProjectsStore.setState({ projects: [] } as never)
  })
  test("a failed send retains drafts and creates no thread", async () => {
    sendMessage.mockRejectedValueOnce(new Error("offline"))
    draw()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send to agent" })))
    expect(useInlineCommentDraftStore.getState().drafts[KEY]).toHaveLength(1)
    expect(useReviewThreadStore.getState().threadsByDirectory).toEqual({})
  })

  test("creates threads only after success and preserves drafts added or edited during send", async () => {
    let finish!: () => void
    sendMessage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    draw()
    fireEvent.click(screen.getByRole("button", { name: "Send to agent" }))
    expect(useReviewThreadStore.getState().threadsByDirectory).toEqual({})
    act(() => {
      useInlineCommentDraftStore.getState().addDraft({
        ...useInlineCommentDraftStore.getState().drafts[KEY][0],
        text: "A new draft",
      })
      useInlineCommentDraftStore.getState().updateDraft(KEY, "d1", { text: "An edited draft" })
    })
    await act(async () => {
      finish()
    })
    expect(useInlineCommentDraftStore.getState().drafts[KEY].map((draft) => draft.text)).toEqual([
      "An edited draft",
      "A new draft",
    ])
    expect(useReviewThreadStore.getState().threadsByDirectory["/repo"].map((thread) => thread.text)).toEqual([
      "Rename this",
    ])
  })

  test("resolve and reopen update the list; re-send sends only open threads to the chosen target", async () => {
    const draft = useInlineCommentDraftStore.getState().drafts[KEY][0]
    useReviewThreadStore
      .getState()
      .recordSent("/repo", [draft, { ...draft, id: "d2", text: "Keep this private" }], "ses_a")
    useReviewThreadStore.getState().recordSent("/elsewhere", [{ ...draft, id: "d3", text: "Another repo" }], "ses_c")
    useInlineCommentDraftStore.setState({ drafts: {} })
    const onSelectFile = vi.fn()
    render(
      <I18nProvider>
        <DiffCommentSummaryBar sessionKey={KEY} showHint={false} onSelectFile={onSelectFile} />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Threads (2 open)" }))
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain("Recipient: Current task")
    fireEvent.click(within(items[1]).getByRole("button", { name: "Resolve" }))
    expect(screen.getByRole("button", { name: "Threads (1 open)" })).toBeTruthy()
    expect(items[1].textContent).toContain("Resolved")
    fireEvent.click(within(items[1]).getByRole("button", { name: "Reopen" }))
    expect(screen.getByRole("button", { name: "Threads (2 open)" })).toBeTruthy()
    fireEvent.click(within(items[1]).getByRole("button", { name: "Resolve" }))
    fireEvent.click(within(items[0]).getByRole("button", { name: "Jump to file" }))
    expect(onSelectFile).toHaveBeenCalledWith("a.ts")
    const select = screen.getByRole("combobox", { name: "Send comments to" }) as HTMLSelectElement
    act(() => {
      select.value = "ses_b"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send open threads again" })))
    const calls = sendMessage.mock.calls as unknown as unknown[][]
    expect(calls[0][0]).toContain("Rename this")
    expect(calls[0][0]).not.toContain("Keep this private")
    expect(calls[0][0]).not.toContain("Another repo")
    expect(calls[0].at(-1)).toEqual({ sessionId: "ses_b" })
    expect(useReviewThreadStore.getState().threadsByDirectory["/repo"]).toHaveLength(2)
    expect(useReviewThreadStore.getState().threadsByDirectory["/repo"][0].recipientSessionId).toBe("ses_b")
    expect(useReviewThreadStore.getState().threadsByDirectory["/repo"][1].recipientSessionId).toBe("ses_a")
    fireEvent.click(within(items[0]).getByRole("button", { name: "Resolve" }))
    expect((screen.getByRole("button", { name: "Send open threads again" }) as HTMLButtonElement).disabled).toBe(true)
  })

  test("rechecks the stored side after edits and lists ambiguous snippets as outdated", async () => {
    const draft = useInlineCommentDraftStore.getState().drafts[KEY][0]
    useReviewThreadStore.getState().recordSent("/repo", [draft], "ses_a")
    useInlineCommentDraftStore.setState({ drafts: {} })
    const view = (modified: string) => (
      <I18nProvider>
        <ReviewThreadContentsContext.Provider value={{ "a.ts": { original: draft.code, modified } }}>
          <DiffCommentSummaryBar sessionKey={KEY} />
        </ReviewThreadContentsContext.Provider>
      </I18nProvider>
    )
    const { rerender } = render(view("header\n" + draft.code))
    fireEvent.click(screen.getByRole("button", { name: "Threads (1 open)" }))
    expect(screen.getByText("a.ts:2-2")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send open threads again" })))
    expect((sendMessage.mock.calls as unknown as unknown[][])[0][0]).toContain("lines 2-2 (modified)")
    rerender(view(draft.code + "\n" + draft.code))
    expect(screen.getByText("a.ts:1-1 (original location)")).toBeTruthy()
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Outdated")
    rerender(view("changed"))
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Outdated")
    expect(useReviewThreadStore.getState().threadsByDirectory["/repo"][0].startLine).toBe(1)
  })

  test("failed re-send leaves recipient, status and timestamp unchanged", async () => {
    useReviewThreadStore.getState().recordSent("/repo", useInlineCommentDraftStore.getState().drafts[KEY], "ses_b")
    useInlineCommentDraftStore.setState({ drafts: {} })
    const before = useReviewThreadStore.getState().threadsByDirectory
    sendMessage.mockRejectedValueOnce(new Error("offline"))
    draw()
    fireEvent.click(screen.getByRole("button", { name: "Threads (1 open)" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send open threads again" })))
    expect(useReviewThreadStore.getState().threadsByDirectory).toEqual(before)
  })
})
