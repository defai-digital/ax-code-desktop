import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  respondToQuestion: vi.fn(),
  rejectQuestion: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/sync/sync-context", () => ({ useSessions: () => [] }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: { currentSessionId: string }) => unknown) =>
    selector({ currentSessionId: "ses_1" }),
}))
vi.mock("@/sync/session-actions", () => ({
  respondToQuestion: mocks.respondToQuestion,
  rejectQuestion: mocks.rejectQuestion,
}))
vi.mock("@/components/ui", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))

import { QuestionCard } from "./QuestionCard"

const question = {
  id: "que_1",
  sessionID: "ses_1",
  questions: [
    {
      question: "Which approach?",
      header: "Approach",
      options: [
        { label: "First option", description: "one" },
        { label: "Second option", description: "two" },
      ],
    },
  ],
}

describe("QuestionCard typed answers", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
  })

  const buttonTexts = () => Array.from(container.querySelectorAll("button")).map((button) => button.textContent ?? "")

  test("offers a typed answer by default", () => {
    React.act(() => {
      root.render(<QuestionCard question={question} />)
    })
    expect(buttonTexts().some((text) => text.includes("chat.questionCard.other"))).toBe(true)
  })

  test("offers only the listed options when the question disallows a typed answer", () => {
    // MCP form elicitation sends enum and boolean fields this way (AX Code ADR-204).
    const fixed = {
      ...question,
      questions: [{ ...question.questions[0], custom: false }],
    }
    React.act(() => {
      root.render(<QuestionCard question={fixed} />)
    })
    expect(buttonTexts().some((text) => text.includes("chat.questionCard.other"))).toBe(false)
    expect(buttonTexts().some((text) => text.includes("First option"))).toBe(true)
  })
})
