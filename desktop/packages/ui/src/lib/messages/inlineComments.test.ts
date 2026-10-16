import { describe, expect, test } from "vitest"

import type { InlineCommentDraft } from "@/stores/useInlineCommentDraftStore"

import { formatInlineCommentDrafts } from "./inlineComments"

const draft = (overrides: Partial<InlineCommentDraft>): InlineCommentDraft =>
  ({
    source: "file",
    fileLabel: "src/app.ts",
    startLine: 3,
    endLine: 5,
    language: "markdown",
    code: "content",
    text: "why this?",
    ...overrides,
  }) as InlineCommentDraft

describe("inline comment fences", () => {
  test("uses a fence long enough for code that contains one", () => {
    // A selected markdown example contains ``` , which closed the block early: the code that
    // followed became prose and the comment itself was swallowed by the code block.
    const code = "```ts\nconst a = 1\n```"
    const message = formatInlineCommentDrafts([draft({ code, text: "is this needed?" })])

    // Four backticks: the longest run inside the code is three, so the block runs to its own fence
    // and the comment stays outside it.
    expect(message).toBe(
      "Comment on `src/app.ts` lines 3-5:\n````markdown\n" + code + "\n````\n\nis this needed?",
    )
  })

  test("grows the fence with the longest run in the code", () => {
    const code = "`````\ninner\n`````"
    const message = formatInlineCommentDrafts([draft({ code, text: "note" })])

    expect(message).toContain("\n``````markdown\n")
    expect(message).toContain("`````\ninner\n`````\n``````\n\nnote")
  })

  test("keeps the plain three-backtick fence when the code has none", () => {
    const message = formatInlineCommentDrafts([draft({ code: "const a = 1" })])

    expect(message).toContain("```markdown\nconst a = 1\n```")
  })

  test("leaves the preview annotation format alone", () => {
    const message = formatInlineCommentDrafts([
      draft({ source: "preview-annotation", code: "```", text: "note" }),
    ])

    expect(message).toBe("```\n\nnote")
  })
})
