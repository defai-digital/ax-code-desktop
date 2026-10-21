import React from "react"
import type { ToolPart as ToolPartType } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))
vi.mock("@/sync/sync-context", () => ({
  useDirectorySync: () => undefined,
  useSessionMessageRecords: () => [],
  useEnsureSessionMessages: () => undefined,
}))
vi.mock("@/hooks/useSessionActivity", () => ({
  useSessionActivity: () => ({ phase: "idle", isWorking: false, isBusy: false, isCooldown: false }),
}))

import ToolPart from "./ToolPart"

afterEach(() => {
  cleanup()
})

const part = (tool: string, state: Record<string, unknown>): ToolPartType =>
  ({
    id: "part_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    type: "tool",
    tool,
    callID: "call_1",
    state,
  }) as unknown as ToolPartType

const renderPart = (tool: string, state: Record<string, unknown>, isExpanded = false) =>
  render(
    <ToolPart
      part={part(tool, state)}
      isExpanded={isExpanded}
      onToggle={() => undefined}
      syntaxTheme={{}}
      isMobile={false}
    />,
  )

const outcome = (container: ParentNode) =>
  container.querySelector("[data-webmcp-outcome]")?.getAttribute("data-webmcp-outcome")

describe("desktop_webmcp transcript rows", () => {
  test("names the page tool and shows an encoded failure while collapsed", () => {
    const { container } = renderPart("desktop_webmcp", {
      status: "completed",
      title: "Desktop WebMCP",
      input: { action: "invoke", toolName: "search-flights", input: { q: "INVENTED_ARGUMENT" } },
      metadata: { operation: "invoke", toolName: "search-flights" },
      output: JSON.stringify({ untrusted: true, result: { isError: true, errorText: "page failed" } }),
    })
    expect(outcome(container)).toBe("failed")
    expect(container.textContent).toContain("search-flights")
    expect(container.textContent).toContain("chat.toolPart.webmcp.failed")
    expect(container.textContent).not.toContain("Desktop WebMCP")
    expect(container.textContent).not.toContain("Desktop webmcp")
  })

  test("does not mark a completed act or a wait miss as failed", () => {
    const done = renderPart("desktop_webmcp", {
      status: "completed",
      title: "Desktop WebMCP",
      input: { action: "act" },
      metadata: { operation: "act" },
      output: JSON.stringify({ untrusted: true, result: { done: true } }),
    })
    expect(outcome(done.container)).toBe("ok")
    expect(done.container.textContent).toContain("act")
    expect(done.container.textContent).not.toContain("chat.toolPart.webmcp.failed")
    expect(done.container.textContent).not.toContain("Desktop WebMCP")

    const missed = renderPart("desktop_webmcp", {
      status: "completed",
      title: "Desktop WebMCP",
      input: { action: "wait" },
      metadata: { operation: "wait" },
      output: JSON.stringify({ untrusted: true, result: { found: false } }),
    })
    expect(outcome(missed.container)).toBe("ok")
    expect(missed.container.textContent).not.toContain("chat.toolPart.webmcp.failed")
  })

  test("shows failure for a thrown tool error and for a completed error status", () => {
    const thrown = renderPart("desktop_webmcp", {
      status: "error",
      title: "Desktop WebMCP",
      input: { action: "navigate" },
      metadata: { operation: "navigate" },
      error: "The page refused the action: stale",
    })
    expect(outcome(thrown.container)).toBe("failed")
    expect(thrown.container.textContent).toContain("navigate")
    expect(thrown.container.textContent).toContain("chat.toolPart.webmcp.failed")

    const embedded = renderPart("desktop_webmcp", {
      status: "completed",
      title: "Desktop WebMCP",
      input: { action: "invoke", toolName: "search-flights" },
      metadata: { operation: "invoke" },
      output: JSON.stringify({ untrusted: true, result: { status: "Error", errorText: "page failed" } }),
    })
    expect(outcome(embedded.container)).toBe("failed")
  })

  test("shows the missing-arguments sentence instead of the model payload", () => {
    const { container } = renderPart(
      "desktop_webmcp",
      {
        status: "completed",
        title: "Desktop WebMCP",
        input: { action: "invoke", toolName: "search-flights", input: { q: "INVENTED_ARGUMENT" } },
        metadata: { operation: "invoke", toolName: "search-flights" },
        output: JSON.stringify({ untrusted: true, result: { ok: true } }),
      },
      true,
    )
    expect(container.textContent).toContain("chat.toolPart.webmcp.argumentsMissing")
    expect(container.textContent).not.toContain("INVENTED_ARGUMENT")
    expect(outcome(container)).toBe("ok")
  })

  test("leaves a bash row unmarked", () => {
    const { container } = renderPart("bash", {
      status: "completed",
      input: { command: "ls" },
      output: "ok",
    })
    expect(container.querySelector("[data-webmcp-outcome]")).toBeNull()
    expect(container.textContent).not.toContain("chat.toolPart.webmcp.failed")
  })
})

test.each(["timeout", "canceled", "cancelled", "aborted"])(
  "transcript reports returned %s with its specific outcome and label",
  (status) => {
    const expected = status === "timeout" ? "timeout" : "cancelled"
    const { container } = renderPart("desktop_webmcp", {
      status: "completed",
      input: { action: "invoke", toolName: "echo" },
      output: JSON.stringify({ untrusted: true, result: { status, isError: true } }),
    })
    expect(outcome(container)).toBe(expected)
    expect(container.textContent).toContain(`chat.toolPart.webmcp.reason.${expected}`)
    expect(container.textContent).not.toContain("chat.toolPart.webmcp.failed")
  },
)

test.each(["definition-changed", "result-too-large", "input-too-large"])(
  "transcript preserves the shared %s reason",
  (reason) => {
    const { container } = renderPart(
      "desktop_webmcp",
      {
        status: "error",
        input: { action: "invoke", toolName: "echo" },
        metadata: { reason },
        error: "Tool result was rejected",
      },
      true,
    )
    expect(container.textContent).toContain(`chat.toolPart.webmcp.reason.${reason}`)
    expect(container.textContent).not.toContain("chat.toolPart.webmcp.reason.provider-gone")
  },
)

test.each(["https://u:AUDIT_FAKE_PASSWORD@example.test/", "https://example.test/?%74oken=AUDIT_FAKE_PASSWORD"])(
  "page labels in transcript headers and expanded metadata are redacted: %s",
  (label) => {
    const { container } = renderPart(
      "desktop_webmcp",
      {
        status: "completed",
        input: { action: "act", toolName: label },
        metadata: {
          operation: "act",
          toolName: label,
          how: "click",
          element: { ref: "e1", name: label, kind: "button" },
        },
        output: JSON.stringify({ done: true }),
      },
      true,
    )
    expect(container.innerHTML).not.toContain("AUDIT_FAKE_PASSWORD")
    expect(container.textContent).toContain("[redacted]")
  },
)

test.each(["desktop_webmcp", "webmcp"])("expanded %s transport errors redact credentials", (tool) => {
  const secret = "ghp_" + "d".repeat(36)
  const { container } = renderPart(tool, {
    status: "error", input: { action: "invoke", toolName: "echo" }, metadata: { operation: "invoke", toolName: "echo" },
    error: `Page rejected ${secret}`,
  }, true)
  expect(container.innerHTML).not.toContain(secret)
  expect(container.textContent).toContain("[redacted]")
})

test.each(["desktop_webmcp", "webmcp"])("expanded %s outputs redact structured and plain results before rendering", (tool) => {
  const secret = "ghp_" + "g".repeat(36)
  for (const output of [secret, JSON.stringify({ token: "AUDIT_HIDDEN_VALUE", message: secret, count: 1 })]) {
    const { container } = renderPart(tool, {
      status: "completed", input: { action: "invoke", toolName: "echo" }, metadata: {}, output,
    }, true)
    expect(container.innerHTML).not.toContain(secret)
    expect(container.innerHTML).not.toContain("AUDIT_HIDDEN_VALUE")
    expect(container.textContent).toContain("[redacted]")
    cleanup()
  }
})
