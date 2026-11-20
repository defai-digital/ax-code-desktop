import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { EvidenceSeal } from "@/lib/supervision/evidenceSeal"
import type { VerificationEvidence } from "@/lib/supervision/verificationEvidence"

const mocks = vi.hoisted(() => ({
  checks: null as VerificationEvidence | null,
  seal: { state: "unverified", reason: "none", head: null, checked: null } as EvidenceSeal,
}))

vi.mock("@/hooks/useEvidenceSeal", () => ({
  useSessionVerification: () => mocks.checks,
  useEvidenceSeal: () => mocks.seal,
}))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))

import { useInputStore } from "@/sync/input-store"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { pullRequestChecksFailed, requestFixKind } from "@/lib/supervision/requestFix"
import { ReviewLandingRequestFix } from "./ReviewLandingRequestFix"

const evidence = (patch: Partial<VerificationEvidence>): VerificationEvidence => ({
  state: "passed",
  passed: 3,
  failed: 0,
  total: 3,
  stale: false,
  ...patch,
})
const seal = (patch: Partial<EvidenceSeal>): EvidenceSeal => ({
  state: "current",
  reason: "same-commit",
  head: "b4e19f2",
  checked: "b4e19f2",
  ...patch,
})

describe("what a fix request is about", () => {
  test("failed checks on the current commit ask for the failures to be fixed", () => {
    expect(requestFixKind(evidence({ state: "failed", failed: 2 }), seal({}))).toBe("failed")
  })

  test("a result about another commit asks for a fresh run, even when it failed", () => {
    expect(requestFixKind(evidence({ state: "failed", failed: 2 }), seal({ state: "stale", reason: "moved" }))).toBe(
      "stale",
    )
  })

  test("an older failed result whose refresh did not load is not quoted as current", () => {
    expect(requestFixKind(evidence({ state: "failed", failed: 2, stale: true }), seal({ state: "unverified" }))).toBe(
      "general",
    )
  })

  test("failed checks on an open pull request ask for a fix forward, after local evidence", () => {
    const pr = { number: 42, state: "open" as const, checks: "failed" as const }
    expect(requestFixKind(evidence({}), seal({}), pr)).toBe("pr-failed")
    expect(requestFixKind(null, seal({ state: "unverified", reason: "none", checked: null }), pr)).toBe("pr-failed")
    // What ran on this tree outranks what CI said about the pushed branch.
    expect(requestFixKind(evidence({ state: "failed", failed: 1 }), seal({}), pr)).toBe("failed")
    expect(requestFixKind(evidence({}), seal({ state: "stale", reason: "moved" }), pr)).toBe("stale")
  })

  test("a merged, closed or stale pull request is not quoted", () => {
    expect(pullRequestChecksFailed({ number: 1, state: "merged", checks: "failed" })).toBe(false)
    expect(pullRequestChecksFailed({ number: 1, state: "closed", checks: "failed" })).toBe(false)
    expect(pullRequestChecksFailed({ number: 1, state: "open", checks: "failed", stale: true })).toBe(false)
    expect(pullRequestChecksFailed({ number: 1, state: "draft", checks: "failed" })).toBe(true)
    expect(pullRequestChecksFailed({ number: 1, state: "open", checks: "pending" })).toBe(false)
  })

  test("a result with no single commit to quote leaves the request to the person", () => {
    const mixed = seal({ state: "stale", reason: "mixed", checked: null })
    expect(requestFixKind(evidence({ state: "failed", failed: 2 }), mixed)).toBe("general")
    const unattributed = seal({ state: "unverified", reason: "unattributed", checked: null })
    expect(requestFixKind(evidence({ state: "failed", failed: 2 }), unattributed)).toBe("general")
  })

  test("passing or missing checks leave the request to the person", () => {
    expect(requestFixKind(evidence({}), seal({}))).toBe("general")
    expect(requestFixKind(null, seal({ state: "unverified", reason: "none", checked: null }))).toBe("general")
  })
})

describe("the Request fix button", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.checks = evidence({ state: "failed", failed: 2 })
    mocks.seal = seal({})
    useSessionUIStore.setState({ currentSessionId: "ses_1" })
    useInputStore.setState({ pendingInputText: null })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  const button = () => container.querySelector<HTMLButtonElement>("[data-landing-request-fix]")

  test("drafts a request that names the failures and their commit, and sends nothing", () => {
    act(() => root.render(<ReviewLandingRequestFix directory="/repo" sessionId="ses_1" />))
    expect(button()?.dataset.landingRequestFix).toBe("failed")
    act(() => button()!.click())
    const draft = useInputStore.getState().consumePendingInputText("ses_1")
    expect(draft?.mode).toBe("append")
    expect(draft?.text).toContain("promptFailed")
    expect(draft?.text).toContain('"count":2')
    expect(draft?.text).toContain('"commit":"b4e19f2"')
  })

  test("a failed pull request becomes a fix-forward draft that names the request and forbids merging", () => {
    mocks.checks = evidence({})
    const pr = { number: 42, state: "open" as const, checks: "failed" as const }
    act(() => root.render(<ReviewLandingRequestFix directory="/repo" sessionId="ses_1" pullRequest={pr} />))
    expect(button()?.dataset.landingRequestFix).toBe("pr-failed")
    expect(button()?.textContent).toContain("fixForward")
    act(() => button()!.click())
    const draft = useInputStore.getState().consumePendingInputText("ses_1")
    expect(draft?.text).toContain("promptPullRequest")
    expect(draft?.text).toContain('"number":42')
  })

  test("a draft for this session is dropped by a composer that shows another one", () => {
    act(() => root.render(<ReviewLandingRequestFix directory="/repo" sessionId="ses_1" />))
    act(() => button()!.click())
    // The person moved on before any composer picked the draft up.
    expect(useInputStore.getState().consumePendingInputText("ses_other")).toBeNull()
    expect(useInputStore.getState().pendingInputText).toBeNull()
  })

  test("is not offered while another session is on screen", () => {
    useSessionUIStore.setState({ currentSessionId: "ses_other" })
    act(() => root.render(<ReviewLandingRequestFix directory="/repo" sessionId="ses_1" />))
    expect(button()).toBeNull()
  })

  test("does not write into the composer when the session changed after the button rendered", () => {
    act(() => root.render(<ReviewLandingRequestFix directory="/repo" sessionId="ses_1" />))
    const stale = button()!
    // The store moves on without a re-render reaching the handler first.
    useSessionUIStore.setState({ currentSessionId: "ses_other" })
    stale.click()
    expect(useInputStore.getState().pendingInputText).toBeNull()
  })
})
