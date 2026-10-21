import { describe, expect, test, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { I18nProvider } from "@/lib/i18n"

vi.doMock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }),
}))

const { CommitSection } = await import("./CommitSection")

const baseProps = {
  commitMessage: "fix: something",
  onCommitMessageChange: () => {},
  generatedHighlights: [],
  onInsertHighlights: () => {},
  onGenerateMessage: () => {},
  isGeneratingMessage: false,
  onCommit: () => {},
  commitAction: null,
  gitmojiEnabled: false,
  onOpenGitmojiPicker: () => {},
}

function render(props: { stagedCount: number; changedCount: number; commitMessage?: string }) {
  return renderToStaticMarkup(
    <I18nProvider>
      <CommitSection {...baseProps} {...props} />
    </I18nProvider>,
  )
}

describe("CommitSection", () => {
  test("enables commit-all when changes exist but nothing is staged", () => {
    const markup = render({ stagedCount: 0, changedCount: 1 })

    expect(markup).toContain("Commit all")
    expect(markup).toContain("Nothing staged")
    const commitButton = markup.slice(markup.lastIndexOf("<button"))
    expect(commitButton).not.toContain('disabled=""')
  })

  test("labels the button Commit when files are staged", () => {
    const markup = render({ stagedCount: 2, changedCount: 2 })

    expect(markup).toContain(">Commit<")
    expect(markup).not.toContain("Commit all")
  })

  test("still requires a commit message", () => {
    const markup = render({ stagedCount: 0, changedCount: 1, commitMessage: "  " })

    const commitButton = markup.slice(markup.lastIndexOf("<button"))
    expect(commitButton).toContain('disabled=""')
  })
})

describe("CommitSection keyboard commit", () => {
  test("Cmd/Ctrl+Enter in the message commits only when committing is allowed", async () => {
    const { render: mount, cleanup, fireEvent } = await import("@/test/dom")
    const onCommit = vi.fn()
    const view = (commitMessage: string) => (
      <I18nProvider>
        <CommitSection {...baseProps} commitMessage={commitMessage} onCommit={onCommit} stagedCount={1} changedCount={1} />
      </I18nProvider>
    )
    const { container, rerender } = mount(view("fix: something"))
    const textarea = () => container.querySelector("textarea")!
    fireEvent.keyDown(textarea(), { key: "Enter" })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.keyDown(textarea(), { key: "Enter", metaKey: true })
    fireEvent.keyDown(textarea(), { key: "Enter", ctrlKey: true })
    expect(onCommit).toHaveBeenCalledTimes(2)
    rerender(view("   "))
    fireEvent.keyDown(textarea(), { key: "Enter", metaKey: true })
    expect(onCommit).toHaveBeenCalledTimes(2)
    cleanup()
  })
})
