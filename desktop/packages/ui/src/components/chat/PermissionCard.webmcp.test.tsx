import React, { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "@/test/dom"
import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import type { PermissionRequest } from "@/types/permission"

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))
vi.mock("@/sync/sync-context", () => ({ useSessions: () => [] }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: { currentSessionId: string }) => unknown) =>
    selector({ currentSessionId: "ses_1" }),
}))
vi.mock("@/sync/session-actions", () => ({
  respondToPermission: vi.fn(async () => undefined),
  saveWebMcpApproval: vi.fn(async () => undefined),
}))
vi.mock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ currentTheme: {} }) }))
vi.mock("@/lib/theme/syntaxThemeGenerator", () => ({ generateSyntaxTheme: () => ({}) }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { PermissionCard } from "./PermissionCard"

afterEach(() => {
  cleanup()
})

const request = (overrides: Partial<PermissionRequest> = {}): PermissionRequest => ({
  id: "per_1",
  sessionID: "ses_1",
  permission: "webmcp",
  patterns: ["https://example.com"],
  metadata: { origin: "https://example.com", desktopProvider: true },
  always: [],
  ...overrides,
})

const buttonTexts = (container: ParentNode) =>
  Array.from(container.querySelectorAll("button")).map((button) => button.textContent ?? "")

const titleText = (container: ParentNode) => container.querySelector("span.truncate.font-medium")?.textContent ?? ""

describe("WebMCP permission card", () => {
  test("an invoke approval shows what the page declared about the tool, labelled as the page's claim", () => {
    const key = viewKeyFor("/repo", "ses_1")
    useWebMcpBrowserStore.getState().updateView(key, {
      sessionID: "ses_1",
      directory: "/repo",
      origin: "https://example.com",
      catalog: [
        nativeWebMcpTool({
          name: "add_task",
          description: "Add a task to the list.",
          inputSchema: {
            type: "object",
            properties: { title: { type: "string" }, priority: { type: "string" } },
            required: ["title"],
          },
          annotations: { consequentialHint: true },
        }),
      ],
    })
    const { container } = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "invoke",
            toolName: "add_task",
            definitionDigest: useWebMcpBrowserStore.getState().views[key].catalog[0].definitionDigest,
            desktopProvider: true,
          },
        })}
      />,
    )
    const info = container.querySelector("[data-webmcp-approval-tool]")
    expect(info?.querySelector("[data-webmcp-approval-hint]")?.getAttribute("data-webmcp-approval-hint")).toBe(
      "consequential",
    )
    expect(info?.querySelector("[data-webmcp-approval-inputs]")?.textContent).toContain("title*, priority")
    expect(info?.querySelector("[data-webmcp-approval-description]")?.textContent).toContain("Add a task to the list.")
    act(() =>
      useWebMcpBrowserStore.getState().updateView(key, {
        catalog: [
          nativeWebMcpTool({
            name: "add_task",
            description: "Replacement definition",
            annotations: { readOnlyHint: true },
          }),
        ],
      }),
    )
    expect(container.querySelector("[data-webmcp-approval-description]")).toBeNull()
    expect(container.querySelector("[data-webmcp-approval-hint]")).toBeNull()
    expect(container.querySelector("[data-webmcp-approval-inputs]")).toBeNull()
    expect(container.textContent).toContain("chat.permissionCard.webmcp.definitionMayDiffer")
    // Another page's tool of the same name is never shown.
    cleanup()
    useWebMcpBrowserStore.getState().updateView(key, { origin: "https://other.example" })
    const other = render(
      <PermissionCard
        permission={request({
          metadata: { origin: "https://example.com", operation: "invoke", toolName: "add_task", desktopProvider: true },
        })}
      />,
    )
    expect(other.container.querySelector("[data-webmcp-approval-tool]")).toBeNull()
    useWebMcpBrowserStore.getState().resetView?.(key)
  })

  test.each([undefined, nativeWebMcpTool({ name: "echo", description: "Earlier claim" }).definitionDigest])(
    "withholds the current definition when the call digest is %s",
    (definitionDigest) => {
      const key = viewKeyFor("/repo", "ses_1")
      useWebMcpBrowserStore.getState().updateView(key, {
        sessionID: "ses_1",
        directory: "/repo",
        origin: "https://example.com",
        catalog: [
          nativeWebMcpTool({ name: "echo", description: "Current claim", annotations: { readOnlyHint: true } }),
        ],
      })
      const { container } = render(
        <PermissionCard
          permission={request({
            metadata: {
              origin: "https://example.com",
              operation: "invoke",
              toolName: "echo",
              definitionDigest,
              desktopProvider: true,
            },
          })}
        />,
      )
      expect(container.textContent).toContain("chat.permissionCard.webmcp.definitionMayDiffer")
      expect(container.textContent).not.toContain("Current claim")
      expect(container.querySelector("[data-webmcp-approval-hint]")).toBeNull()
      cleanup()
      useWebMcpBrowserStore.getState().resetView(key)
    },
  )

  test("opens with one plain effect sentence and says the answer covers this call only", () => {
    const { container } = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "act",
            how: "click",
            // A page could word its own description to look harmless; the sentence must not use it.
            description: "Totally safe, nothing happens",
            element: { ref: "e9", kind: "button", name: "Delete account", submit: true },
            desktopProvider: true,
          },
        })}
      />,
    )
    const effect = container.querySelector("[data-webmcp-effect]")
    expect(effect?.getAttribute("data-webmcp-effect")).toBe("clickSubmit")
    expect(effect?.textContent).toContain("Delete account")
    expect(effect?.textContent).not.toContain("Totally safe")
    expect(container.textContent).toContain("chat.permissionCard.webmcp.scopeOnce")
  })

  test("shows the act target, submit flag, and typed text", () => {
    const { container } = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "act",
            how: "type",
            text: "Toronto",
            element: { ref: "e2", kind: "textbox", name: "From", submit: true },
            desktopProvider: true,
          },
        })}
      />,
    )
    expect(container.textContent).toContain("e2")
    expect(container.textContent).toContain("textbox")
    expect(container.textContent).toContain("From")
    expect(container.textContent).toContain("Toronto")
    expect(container.textContent).toContain("type")
    expect(container.textContent).toContain("chat.permissionCard.webmcp.submit")
    expect(container.textContent).not.toContain("chat.permissionCard.webmcp.doesNotSubmit")
  })

  test("shows that an act will not submit and does not invent typed text", () => {
    const { container } = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "act",
            how: "click",
            element: { ref: "e9", kind: "button", name: "Password", submit: false },
            desktopProvider: true,
          },
        })}
      />,
    )
    expect(container.textContent).toContain("Password")
    expect(container.textContent).toContain("chat.permissionCard.webmcp.doesNotSubmit")
    expect(container.textContent).not.toContain("chat.permissionCard.webmcp.submit")
    expect(container.textContent).not.toContain("chat.permissionCard.webmcp.text")
    expect(container.textContent).not.toContain("chat.permissionCard.webmcp.textRedacted")
  })

  test("redacts credential-like act text and truncates long text", () => {
    const secret = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "act",
            how: "type",
            text: "password=supersecretvalue",
            element: { ref: "e2", kind: "textbox", name: "From", submit: true },
            desktopProvider: true,
          },
        })}
      />,
    )
    expect(secret.container.textContent).not.toContain("supersecretvalue")
    expect(secret.container.textContent).toContain("chat.permissionCard.webmcp.textRedacted")

    const tail = "UNIQUE_TAIL"
    const long = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "act",
            how: "type",
            text: `${"A".repeat(300)}${tail}`,
            element: { ref: "e2", kind: "textbox", name: "From", submit: false },
            desktopProvider: true,
          },
        })}
      />,
    )
    expect(long.container.textContent).toContain("…")
    expect(long.container.textContent).not.toContain(tail)
  })

  test("titles the card with the page tool or the operation", () => {
    const named = render(
      <PermissionCard
        permission={request({
          metadata: { origin: "https://example.com", operation: "invoke", toolName: "search-flights" },
        })}
      />,
    )
    expect(titleText(named.container)).toBe("search-flights")

    const operation = render(
      <PermissionCard
        permission={request({
          metadata: { origin: "https://example.com", operation: "navigate" },
        })}
      />,
    )
    expect(titleText(operation.container)).toBe("navigate")

    const fallback = render(
      <PermissionCard permission={request({ metadata: { origin: "https://example.com" } })} />,
    )
    expect(titleText(fallback.container)).toBe("webmcp")
  })

  test("does not offer always-allow without a named scope and leaves other tools alone", () => {
    const webmcp = render(
      <PermissionCard
        permission={request({
          interactiveOnly: false,
          webmcpAllowlist: {
            server: "bridge",
            project: "app",
            scope: { capability: "navigate", origin: "https://example.com" },
          },
          metadata: { origin: "https://example.com", operation: "navigate", requireInteractive: false },
        })}
      />,
    )
    // The Chrome bridge keeps its own named scope, the site allowlist record, so its approval stays available.
    const texts = buttonTexts(webmcp.container)
    expect(texts.some((text) => text.includes("chat.permissionCard.actions.allowOnce"))).toBe(true)
    expect(texts.some((text) => text.includes("chat.permissionCard.actions.deny"))).toBe(true)
    expect(texts.some((text) => text.includes("webmcp.allowlist.alwaysAllowOnSite"))).toBe(true)

    // The built-in project browser has no standing grant: neither always action is offered.
    const provider = render(
      <PermissionCard
        permission={request({
          interactiveOnly: false,
          webmcpAllowlist: {
            server: "bridge",
            project: "app",
            scope: { capability: "navigate", origin: "https://example.com" },
          },
          metadata: { origin: "https://example.com", operation: "act", desktopProvider: true, requireInteractive: false },
        })}
      />,
    )
    const providerTexts = buttonTexts(provider.container)
    expect(providerTexts.some((text) => text.includes("chat.permissionCard.actions.allowAlways"))).toBe(false)
    expect(providerTexts.some((text) => text.includes("webmcp.allowlist.alwaysAllowOnSite"))).toBe(false)

    const desktop = render(
      <PermissionCard
        permission={request({
          permission: "desktop_webmcp",
          metadata: { origin: "https://example.com", operation: "read" },
        })}
      />,
    )
    expect(buttonTexts(desktop.container).some((text) => text.includes("allowAlways"))).toBe(false)

    const named = render(
      <PermissionCard
        permission={request({
          always: ["https://example.com/*"],
          metadata: { origin: "https://example.com", operation: "navigate" },
        })}
      />,
    )
    const namedTexts = buttonTexts(named.container)
    expect(namedTexts.some((text) => text.includes("chat.permissionCard.alwaysPatterns"))).toBe(true)
    expect(namedTexts.some((text) => text.includes("chat.permissionCard.actions.allowAlways"))).toBe(false)
    expect(namedTexts.some((text) => text.includes("webmcp.allowlist.alwaysAllowOnSite"))).toBe(false)

    const bash = render(
      <PermissionCard
        permission={request({
          permission: "bash",
          patterns: ["npm test"],
          always: [],
          metadata: { command: "npm test" },
          webmcpAllowlist: undefined,
        })}
      />,
    )
    expect(buttonTexts(bash.container).some((text) => text.includes("chat.permissionCard.actions.allowAlways"))).toBe(
      true,
    )
  })

  test("says when invoke arguments were not provided", () => {
    const { container } = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "invoke",
            toolName: "search-flights",
            sample: "INVENTED_ARGUMENT",
            desktopProvider: true,
          },
        })}
      />,
    )
    expect(container.textContent).toContain("chat.permissionCard.webmcp.argumentsMissing")
    expect(container.textContent).not.toContain("INVENTED_ARGUMENT")
    expect(container.textContent).not.toContain("{}")
  })
})

test.each([1, 5, 14])("approval lists required properties before the twelve-input cap (%s required)", (count) => {
  const key = viewKeyFor("/repo", "ses_1")
  const optional = Array.from({ length: 13 }, (_, index) => `optional${index}`)
  const required = Array.from({ length: count }, (_, index) => `required${index}`)
  useWebMcpBrowserStore.getState().updateView(key, {
    sessionID: "ses_1",
    directory: "/repo",
    origin: "https://example.com",
    catalog: [
      nativeWebMcpTool({
        name: "echo",
        description: "Echo",
        inputSchema: {
          type: "object",
          properties: Object.fromEntries([...optional, ...required].map((name) => [name, { type: "string" }])),
          required,
        },
      }),
    ],
  })
  const { container } = render(
    <PermissionCard
      permission={request({
        metadata: {
          origin: "https://example.com",
          operation: "invoke",
          toolName: "echo",
          definitionDigest: useWebMcpBrowserStore.getState().views[key].catalog[0].definitionDigest,
          desktopProvider: true,
        },
      })}
    />,
  )
  const text = container.querySelector("[data-webmcp-approval-inputs]")!.textContent!
  const names = JSON.parse(text.slice(text.indexOf(":") + 1)).names.split(", ")
  expect(names).toEqual([...required.map((name) => `${name}*`), ...optional].slice(0, 12))
  useWebMcpBrowserStore.getState().resetView(key)
})


test.each(["frame", "missing-native"])("approval does not substitute catalog identity: %s", (change) => {
  const key = viewKeyFor("/repo", "ses_1")
  const original = nativeWebMcpTool({ name: "echo", description: "Page claim" })
  const current = change === "frame" ? nativeWebMcpTool(original, "replacement-frame")
    : { ...original, definitionDigest: undefined }
  expect(current.digest).toBe(original.digest)
  useWebMcpBrowserStore.getState().updateView(key, {
    sessionID: "ses_1", directory: "/repo", origin: "https://example.com", catalog: [current],
  })
  const { container } = render(<PermissionCard permission={request({ metadata: {
    origin: "https://example.com", operation: "invoke", toolName: "echo",
    definitionDigest: original.definitionDigest, desktopProvider: true,
  } })} />)
  expect(container.querySelector("[data-webmcp-approval-tool]")).toBeNull()
  expect(container.querySelector("[data-webmcp-approval-definition-unknown]")).not.toBeNull()
  useWebMcpBrowserStore.getState().resetView(key)
})

test.each([12, 15, 18])(
  "approval input summaries show truncation and omitted required counts for %i inputs",
  (count) => {
    const key = viewKeyFor("/repo", "ses_1")
    const names = Array.from({ length: count }, (_, index) => `input_${index}`)
    const tool = nativeWebMcpTool({
      name: "approve",
      description: "Safe description",
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(names.map((name) => [name, { type: "string" }])),
        required: names.slice(0, 15),
      },
    })
    useWebMcpBrowserStore
      .getState()
      .updateView(key, { sessionID: "ses_1", directory: "/repo", origin: "https://example.com", catalog: [tool] })
    const { container } = render(
      <PermissionCard
        permission={request({
          metadata: {
            origin: "https://example.com",
            operation: "invoke",
            toolName: tool.name,
            definitionDigest: tool.definitionDigest,
            desktopProvider: true,
          },
        })}
      />,
    )
    const note = container.querySelector("[data-webmcp-approval-inputs-truncated]")
    if (count === 12) expect(note).toBeNull()
    else {
      expect(note?.textContent).toContain('"shown":12')
      expect(note?.textContent).toContain(`"total":${count}`)
      expect(note?.textContent).toContain('"required":3')
    }
  },
)

test.each([
  "password=AUDIT_FAKE_PASSWORD",
  "https://u:AUDIT_FAKE_PASSWORD@example.test/",
  "https://example.test/?%74oken=AUDIT_FAKE_PASSWORD",
])("approval descriptions and schema names redact page-supplied credentials: %s", (description) => {
  const key = viewKeyFor("/repo", "ses_1")
  const tool = nativeWebMcpTool({
    name: "approve",
    description,
    inputSchema: { type: "object", properties: { [description]: { type: "string" } }, required: [description] },
  })
  useWebMcpBrowserStore
    .getState()
    .updateView(key, { sessionID: "ses_1", directory: "/repo", origin: "https://example.com", catalog: [tool] })
  const { container } = render(
    <PermissionCard
      permission={request({
        metadata: {
          origin: "https://example.com",
          operation: "invoke",
          toolName: tool.name,
          definitionDigest: tool.definitionDigest,
          desktopProvider: true,
        },
      })}
    />,
  )
  expect(container.innerHTML).not.toContain("AUDIT_FAKE_PASSWORD")
  expect(container.querySelector("[data-webmcp-approval-description]")?.textContent).toContain("[redacted]")
  expect(container.querySelector("[data-webmcp-approval-inputs]")?.textContent).toContain("[redacted]*")
})

test("approval effects redact complete element names before truncation and preserve lookup identity", () => {
  const label = `${"x".repeat(75)} https://u:AUDIT_FAKE_PASSWORD@example.test/`
  const { container } = render(
    <PermissionCard
      permission={request({
        metadata: {
          origin: "https://example.com",
          operation: "act",
          how: "click",
          desktopProvider: true,
          toolName: "password=AUDIT_FAKE_PASSWORD",
          element: { ref: "e1", kind: "button", name: label },
        },
      })}
    />,
  )
  expect(container.innerHTML).not.toContain("AUDIT_FAKE_PASSWORD")
  expect(container.querySelector("[data-webmcp-effect]")?.textContent).toContain("[redacted]")
})

test.each(["webmcp", "desktop_webmcp", "WebMCP"])("%s approval scopes redact credentials without changing response scope", (permission) => {
  const secret = "ghp_" + "h".repeat(36)
  const { container } = render(<PermissionCard permission={request({
    permission, patterns: [`https://example.test/${secret}`], always: [secret],
  })} />)
  expect(container.innerHTML).not.toContain(secret)
  expect(container.textContent).toContain("[redacted]")
})

test("WebMCP approval response errors are redacted in toast text and logs", async () => {
  const { respondToPermission } = await import("@/sync/session-actions")
  const { toast } = await import("@/components/ui")
  const secret = "ghp_" + "m".repeat(36)
  vi.mocked(respondToPermission).mockRejectedValueOnce(new Error(secret))
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    const { container } = render(<PermissionCard permission={request()} />)
    const button = [...container.querySelectorAll("button")].find((node) => node.textContent?.includes("chat.permissionCard.actions.allowOnce"))!
    expect(button).toBeTruthy()
    await act(async () => button.click())
    expect(log).toHaveBeenCalledWith("[PermissionCard] Failed to respond to permission:", "[redacted]")
    expect(toast.error).toHaveBeenCalledWith("chat.permissionCard.responseFailed.title", { description: "[redacted]" })
  } finally { log.mockRestore() }
})
