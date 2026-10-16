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

const respondToQuestion = mocks.respondToQuestion
const rejectQuestion = mocks.rejectQuestion
const toastError = mocks.toastError

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

describe("QuestionCard stalled reply", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    respondToQuestion.mockReset()
    rejectQuestion.mockReset()
    toastError.mockReset()
  })

  afterEach(() => {
    React.act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const findButton = (text: string) =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text)) as
      | HTMLButtonElement
      | undefined

  test("unlocks the card when the reply never settles", async () => {
    // respondToQuestion waits for a connection and then for the runtime. PermissionCard bounds
    // the same path with withTimeout because a promise that never settles left submittingRef
    // true for good: both buttons stayed disabled and the agent stayed blocked on the question.
    respondToQuestion.mockReturnValue(new Promise(() => {}))

    React.act(() => {
      root.render(<QuestionCard question={question} />)
    })

    const option = findButton("First option")
    expect(option).toBeTruthy()
    React.act(() => {
      option?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const submit = findButton("chat.questionCard.submit")
    expect(submit).toBeTruthy()
    expect(submit?.disabled).toBe(false)

    await React.act(async () => {
      submit?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(findButton("chat.questionCard.submit")?.disabled).toBe(true)

    await React.act(async () => {
      vi.advanceTimersByTime(20_001)
    })

    expect(findButton("chat.questionCard.submit")?.disabled).toBe(false)
    expect(findButton("chat.questionCard.dismiss")?.disabled).toBe(false)
    expect(toastError).toHaveBeenCalled()
  })
})
