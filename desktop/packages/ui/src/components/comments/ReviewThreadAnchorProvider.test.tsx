import React from "react"
import { afterEach, expect, test } from "vitest"
import { cleanup, render, screen } from "@/test/dom"
import { RegisterReviewThreadContentContext, ReviewThreadContentsContext } from "./ReviewThreadAnchorContext"
import { ReviewThreadAnchorProvider } from "./ReviewThreadAnchorProvider"

function Viewer({ modified }: { modified: string }) {
  const register = React.useContext(RegisterReviewThreadContentContext)
  React.useEffect(() => register?.("a.ts", { original: "before", modified }), [register, modified])
  return null
}

function ReadContent() {
  const content = React.useContext(ReviewThreadContentsContext)
  return <output role="status">{content["a.ts"]?.modified ?? "No mounted diff"}</output>
}

afterEach(cleanup)

test("uses fresh displayed content and removes it when the viewer is unmounted", () => {
  const view = (modified: string | null) => (
    <ReviewThreadAnchorProvider scope="repo-a:unstaged">
      {modified !== null ? <Viewer modified={modified} /> : null}
      <ReadContent />
    </ReviewThreadAnchorProvider>
  )
  const { rerender } = render(view("first"))
  expect(screen.getByRole("status").textContent).toBe("first")
  rerender(view("agent edit"))
  expect(screen.getByRole("status").textContent).toBe("agent edit")
  rerender(view(null))
  expect(screen.getByRole("status").textContent).toBe("No mounted diff")
})

test("does not share content between pane scopes or retain it after changing repository", () => {
  const view = (scope: string, showViewer: boolean) => (
    <>
      <ReviewThreadAnchorProvider scope={scope}>
        {showViewer ? <Viewer modified="repo A diff" /> : null}
        <ReadContent />
      </ReviewThreadAnchorProvider>
      <ReviewThreadAnchorProvider scope="another-pane">
        <ReadContent />
      </ReviewThreadAnchorProvider>
    </>
  )
  const { rerender } = render(view("repo-a:staged", true))
  expect(screen.getAllByRole("status").map((element) => element.textContent)).toEqual([
    "repo A diff",
    "No mounted diff",
  ])
  rerender(view("repo-b:unstaged", false))
  expect(screen.getAllByRole("status").map((element) => element.textContent)).toEqual([
    "No mounted diff",
    "No mounted diff",
  ])
})
