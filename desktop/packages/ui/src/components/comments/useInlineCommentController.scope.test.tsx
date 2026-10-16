import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const { useInlineCommentController } = await import("./useInlineCommentController")
const { useSessionUIStore } = await import("@/sync/session-ui-store")
const { useInlineCommentDraftStore } = await import("@/stores/useInlineCommentDraftStore")

type Range = { start: number; end: number }
type Controller = ReturnType<typeof useInlineCommentController<Range>>

describe("inline comment controller scope", () => {
  let container: HTMLDivElement
  let root: Root
  const controller = { current: null as Controller | null }

  const Probe = ({ fileLabel }: { fileLabel: string }) => {
    controller.current = useInlineCommentController<Range>({
      source: "file",
      fileLabel,
      language: "text",
      getCodeForRange: () => "",
      toStoreRange: (range) => ({ startLine: range.start, endLine: range.end }),
      fromDraftRange: (draft) => ({ start: draft.startLine, end: draft.endLine }),
    })
    return (
      <span>
        {controller.current.selection ? `${controller.current.selection.start}-${controller.current.selection.end}` : "none"}|
        {controller.current.commentText}
      </span>
    )
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useSessionUIStore.setState({ currentSessionId: "ses_1", newSessionDraft: null } as never)
    useInlineCommentDraftStore.setState({ drafts: {} } as never)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  const render = (fileLabel: string) => act(() => root.render(<Probe fileLabel={fileLabel} />))

  test("clears the open selection and its text when the file changes", () => {
    // The reset keys on the session (and the draft project). The file view passes the selected file's path as
    // `fileLabel` and is not remounted per file, so switching files with the comment box open kept the selection,
    // the half-typed text and `editingDraftId` — a save then wrote the comment against the file now on screen, or
    // moved the draft it was editing to that file.
    render("/repo/a.ts")
    act(() => controller.current?.setSelection({ start: 3, end: 5 }))
    act(() => controller.current?.setCommentText("half typed"))
    expect(container.textContent).toBe("3-5|half typed")

    render("/repo/b.ts")

    expect(container.textContent).toBe("none|")
  })
})
