import React, { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { useInlineCommentDraftStore } from "@/stores/useInlineCommentDraftStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { cleanup, fireEvent, render, screen } from "@/test/dom"

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
  const sendMessage = vi.fn(async () => undefined)

  beforeEach(() => {
    harness.rows = [row("ses_a", "Current task", "/repo"), row("ses_b", "Other agent", "/repo"), row("ses_c", "Elsewhere", "/other")]
    sendMessage.mockClear()
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
    useInlineCommentDraftStore.setState({ drafts: { other: useInlineCommentDraftStore.getState().drafts[KEY] } } as never)
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
    useProjectsStore.setState({ projects: [{ id: "p1", path: "/repo", label: "Repo", addedAt: 0, lastOpenedAt: 0 }] } as never)
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
})
