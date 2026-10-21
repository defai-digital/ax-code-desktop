import { webMcpToolIdentity } from "@/lib/webMcpCatalog"
import { compoundKeys } from "../../../../../shared/testing/webmcp-redaction-cases.mjs"
import { nativeWebMcpTool, projectedWebMcpTool } from "@/test/webMcpCatalog"
import { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/i18n/messages/en")
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) => {
        // Render real localized constraint/limit prose while retaining stable keys for other controls.
        if (key.startsWith("webmcp.tools.constraint.") || key === "webmcp.tools.inputLimit") {
          const template = dict[key as keyof typeof dict]
          return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ""))
        }
        return params ? `${key}:${Object.values(params).join("|")}` : key
      },
    }),
  }
})
import type { WebMcpCall } from "@/lib/webMcpCalls"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { WebMcpToolPanel, type TryTool } from "./WebMcpToolPanel"

afterEach(() => {
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
})

const catalog = [
  nativeWebMcpTool({
    name: "add_numbers",
    description: "Add two integers",
    inputSchema: {
      type: "object",
      properties: { a: { type: "integer" }, b: { type: "integer" } },
      required: ["a", "b"],
    },
  }),
]

describe("WebMCP tool panel", () => {
  test("shows the page's tools while agent access is off and runs one as the user", async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", enabled: false, catalog })
    const tryTool = vi.fn(async () => ({ ok: true, output: { content: [{ type: "text", text: "5" }] } }))
    const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    const [a, b] = [...container.querySelectorAll<HTMLInputElement>("input")]
    fireEvent.change(a, { target: { value: "2" } })
    fireEvent.change(b, { target: { value: "3" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    })
    expect(tryTool).toHaveBeenCalledWith(catalog[0].invocationID, { a: 2, b: 3 }, expect.objectContaining({ origin: expect.any(String) }))
    expect(container.querySelector("[data-webmcp-tool-result='completed']")?.textContent).toContain('"text": "5"')
  })

  test("an invalid value is reported before anything runs, and a failed run says so", async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog })
    const tryTool = vi.fn(async () => ({ ok: false, reason: "invoke-failed" }))
    const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    })
    expect(tryTool).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Enter a value for a.")
    const [a, b] = [...container.querySelectorAll<HTMLInputElement>("input")]
    fireEvent.change(a, { target: { value: "1" } })
    fireEvent.change(b, { target: { value: "1" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    })
    expect(container.querySelector("[data-webmcp-tool-result='failed']")?.textContent).toBe(
      "chat.toolPart.webmcp.reason.native-failure",
    )
  })

  test("renders nothing without a page origin or tools", () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ origin: null, catalog })
    expect(render(<WebMcpToolPanel tryTool={vi.fn()} />).container.innerHTML).toBe("")
  })
})

function openTool(
  inputSchema: unknown,
  reply = vi.fn(async (): Promise<import("./WebMcpToolPanel").TryResult> => ({ ok: true })),
) {
  useWebMcpBrowserStore
    .getState()
    .updateSnapshot({ origin: "https://shop.test", catalog: [nativeWebMcpTool({ name: "echo", description: "Echo", inputSchema })] })
  const view = render(<WebMcpToolPanel tryTool={reply} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  return { ...view, reply }
}
const runTool = async (name = "webmcp.tools.try") => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }))
  })
}

test("30 rendered fields send padded property 25, empty, zero and false without an absent field", async () => {
  const properties = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [`p${i + 1}`, { type: i === 1 ? "number" : i === 2 ? "boolean" : "string" }]),
  )
  const { container, reply } = openTool({ type: "object", properties })
  expect(container.querySelectorAll("input:not([type=checkbox]), select")).toHaveLength(30)
  const inputs = [
    ...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([type=checkbox]), select"),
  ]
  fireEvent.click(container.querySelector<HTMLInputElement>("input[type=checkbox]")!)
  fireEvent.change(inputs[1], { target: { value: "0" } })
  fireEvent.change(inputs[2], { target: { value: "option-1" } })
  fireEvent.change(inputs[24], { target: { value: "  lead  " } })
  fireEvent.change(inputs[29], { target: { value: "last" } })
  await runTool()
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { p1: "", p2: 0, p3: false, p25: "  lead  ", p30: "last" }, expect.objectContaining({ origin: expect.any(String) }))
})

test("constraints appear beside fields and advisory checks allow sending unchanged input", async () => {
  const { container, reply } = openTool({
    type: "object",
    properties: {
      count: { type: "number", minimum: 1, maximum: 10, default: 2 },
      text: { type: "string", minLength: 2, maxLength: 4, format: "email" },
      mode: { type: "string", enum: ["a", "b"] },
      password: { type: "string", minLength: 8, default: "hunter2" },
    },
  })
  const hints = [...container.querySelectorAll("[data-webmcp-constraints]")].map((node) => node.textContent).join(" ")
  expect(hints).not.toContain("hunter2")
  expect(hints).toContain("[redacted]")
  for (const text of [
    "at least 1",
    "at most 10",
    "default for count: 2",
    "at least 2 characters",
    "at most 4 characters",
    "format for text: email",
    "Choose one of",
  ])
    expect(hints).toContain(text)
  fireEvent.change(container.querySelector<HTMLInputElement>("input:not([type=checkbox])")!, { target: { value: "0" } })
  await runTool()
  expect(reply).not.toHaveBeenCalled()
  expect(container.textContent).toContain("count must be at least 1.")
  expect(container.textContent).toContain("webmcp.tools.advisory")
  await runTool("webmcp.tools.sendAnyway")
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { count: 0 }, expect.objectContaining({ origin: expect.any(String) }))
  expect(screen.queryByRole("button", { name: "webmcp.tools.sendAnyway" })).toBeNull()
  expect(screen.queryByRole("button", { name: "webmcp.tools.try" })).not.toBeNull()
  expect(container.querySelector("[role=alert]")).toBeNull()
  // Each later attempt must present the advisory again.
  await runTool()
  expect(reply).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("button", { name: "webmcp.tools.sendAnyway" })).not.toBeNull()
})

test.each([
  [{ ok: true, outcome: "completed", output: "ok" }, "completed", "webmcp.tools.completed"],
  [
    { ok: false, outcome: "application-error", reason: "application-error" },
    "application-error",
    "chat.toolPart.webmcp.reason.application-error",
  ],
  [{ ok: true, output: { isError: true } }, "application-error", "chat.toolPart.webmcp.reason.application-error"],
  [{ ok: true, output: { status: "timeout", isError: true } }, "timeout", "chat.toolPart.webmcp.reason.timeout"],
  [{ ok: true, output: { status: "canceled" } }, "cancelled", "chat.toolPart.webmcp.reason.cancelled"],
  [
    { ok: true, output: { untrusted: true, result: { status: "cancelled", ok: false } } },
    "cancelled",
    "chat.toolPart.webmcp.reason.cancelled",
  ],
  [
    { ok: true, output: JSON.stringify({ untrusted: true, result: { status: "aborted" } }) },
    "cancelled",
    "chat.toolPart.webmcp.reason.cancelled",
  ],
  [
    { ok: false, outcome: "failed", reason: "result-too-large" },
    "failed",
    "chat.toolPart.webmcp.reason.result-too-large",
  ],
  [
    { ok: false, outcome: "failed", reason: "definition-changed" },
    "failed",
    "chat.toolPart.webmcp.reason.definition-changed",
  ],
  [{ ok: false, outcome: "timeout", reason: "timeout" }, "timeout", "chat.toolPart.webmcp.reason.timeout"],
  [{ ok: false, outcome: "cancelled", reason: "cancelled" }, "cancelled", "chat.toolPart.webmcp.reason.cancelled"],
  [{ ok: false, outcome: "uncertain", reason: "provider-gone" }, "uncertain", "webmcp.tools.uncertain"],
] as const)("outcome %j renders distinctly", async (result, outcome, label) => {
  const reply = vi.fn(async () => result)
  const { container } = openTool(undefined, reply)
  await runTool()
  const block = container.querySelector(`[data-webmcp-tool-result='${outcome}']`)
  expect(block?.textContent).toContain(label)
  expect(block?.className.includes("status-error")).toBe(outcome !== "completed")
  expect(container.textContent?.includes("webmcp.tools.inspectPage")).toBe(outcome === "uncertain")
  expect(reply).toHaveBeenCalledTimes(1)
})

test("lost IPC is uncertain, instructs inspection and never retries or displays raw errors", async () => {
  const reply = vi.fn(async () => {
    throw new Error("password=hunter2")
  })
  const { container } = openTool(undefined, reply)
  await runTool()
  expect(container.querySelector("[data-webmcp-tool-result=uncertain]")).not.toBeNull()
  expect(container.textContent).toContain("webmcp.tools.inspectPage")
  expect(container.textContent).not.toContain("hunter2")
  expect(reply).toHaveBeenCalledTimes(1)
})

test("untrusted results are bounded, credential-filtered and rendered as inert text", async () => {
  const { container } = openTool(
    undefined,
    vi.fn(async () => ({
      ok: true,
      output: {
        password: "hunter2",
        text: "token=short",
        html: "<img src=x onerror=alert(1)>",
        long: "a".repeat(9000),
      },
    })),
  )
  await runTool()
  const block = container.querySelector("[data-webmcp-tool-result=completed]")!
  expect(block.textContent).not.toContain("hunter2")
  expect(block.textContent).not.toContain("token=short")
  expect(block.textContent).toContain("[redacted]")
  expect(block.textContent).toContain("<img")
  expect(block.querySelector("img")).toBeNull()
  expect(block.textContent!.length).toBeLessThan(4100)
})

test.each([
  [{ type: "object", properties: { nested: { type: "object" } } }, "webmcp.tools.jsonComplex"],
  [
    { type: "object", properties: Object.fromEntries(Array.from({ length: 129 }, (_, i) => [i, { type: "string" }])) },
    "webmcp.tools.jsonLarge",
  ],
])("JSON fallback explains its reason and sends the full input", async (schema, reason) => {
  const { container, reply } = openTool(schema)
  expect(container.textContent).toContain(reason)
  fireEvent.change(container.querySelector("textarea")!, { target: { value: '{"nested":{"text":"  exact  "}}' } })
  await runTool()
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { nested: { text: "  exact  " } }, expect.objectContaining({ origin: expect.any(String) }))
})

test("JSON escape hatch keeps input editable even when primitive conversion fails", async () => {
  const { container, reply } = openTool({ type: "object", properties: { x: { type: "integer" } }, required: ["x"] })
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.useJson" }))
  fireEvent.change(container.querySelector("textarea")!, { target: { value: '{"x":1}' } })
  await runTool()
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { x: 1 }, expect.objectContaining({ origin: expect.any(String) }))
})

const descriptions = (input: Element) =>
  (input.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const element = document.getElementById(id)
      expect(element).not.toBeNull()
      return element!
    })

test("labels and per-field descriptions expose the correct hint and warning for inputs and selects", async () => {
  const { container, reply } = openTool({
    type: "object",
    properties: {
      "item count": { type: "number", minimum: 5 },
      text: { type: "string", minLength: 3 },
      mode: { type: "string", enum: ["a", "b"] },
      flag: { type: "boolean", description: "Whether to enable the feature" },
    },
  })
  const inputs = [
    ...container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([type=checkbox]), select"),
  ]
  for (const [index, name] of ["item count", "text", "mode", "flag"].entries()) {
    expect(inputs[index].labels?.length).toBe(1)
    expect(inputs[index].labels?.[0].control).toBe(inputs[index])
    expect(inputs[index].labels?.[0].textContent).toContain(name)
  }
  expect(inputs[3].labels?.[0].textContent).toContain("Whether to enable the feature")
  expect(
    descriptions(inputs[0])
      .map((node) => node.textContent)
      .join(" "),
  ).toBe("item count must be at least 5.")
  expect(
    descriptions(inputs[1])
      .map((node) => node.textContent)
      .join(" "),
  ).toBe("text must contain at least 3 characters.")
  expect(descriptions(inputs[2])[0].textContent).toContain('Choose one of [\n  "a",\n  "b"\n] for mode.')
  fireEvent.change(inputs[0], { target: { value: "1" } })
  fireEvent.change(inputs[1], { target: { value: "x" } })
  await runTool()
  expect(reply).not.toHaveBeenCalled()
  for (const input of inputs.slice(0, 2)) {
    const linked = descriptions(input)
    expect(linked).toHaveLength(2)
    expect(linked[1].getAttribute("role")).toBe("alert")
    expect(linked[1].textContent).toBe(linked[0].textContent)
  }
  const checkbox = container.querySelector<HTMLInputElement>("input[type=checkbox]")!
  expect(checkbox.labels?.[0].textContent).toContain("webmcp.tools.sendEmpty:text")
  expect(descriptions(checkbox)).toEqual(descriptions(inputs[1]))
  // Editing clears obsolete warnings and removes their description links.
  fireEvent.change(inputs[0], { target: { value: "5" } })
  expect(descriptions(inputs[0])).toHaveLength(1)
  expect(container.querySelector("[role=alert]")).toBeNull()
})

test.each([
  ["integer", "2.5", "Enter a whole number for value."],
  ["number", "no", "Enter a finite number for value."],
  ["string", "", "Enter a value for value."],
])("%s conversion errors use plain localized words and are linked to the field", async (type, value, message) => {
  const { container, reply } = openTool({ type: "object", properties: { value: { type } }, required: ["value"] })
  const input = container.querySelector<HTMLInputElement>("input:not([type=checkbox])")!
  fireEvent.change(input, { target: { value } })
  await runTool()
  expect(reply).not.toHaveBeenCalled()
  expect(descriptions(input)[0].textContent).toBe(message)
  expect(screen.getByRole("status").textContent).toContain(message)
})

test("the boolean constraint message names the expected choices", async () => {
  const { container } = openTool({ type: "object", properties: { flag: { type: "boolean" } } })
  const input = container.querySelector("select")!
  const unsupported = document.createElement("option")
  unsupported.value = "other"
  input.appendChild(unsupported)
  fireEvent.change(input, { target: { value: "other" } })
  await runTool()
  expect(descriptions(input)[0].textContent).toBe("Choose true or false for flag.")
})

test.each([
  [{ type: "number", maximum: 3 }, "4", "value must be at most 3."],
  [{ type: "string", maxLength: 2 }, "abc", "value must contain at most 2 characters."],
])("advisory messages name their actual bound: %j", async (property, value, message) => {
  const { container, reply } = openTool({ type: "object", properties: { value: property } })
  fireEvent.change(container.querySelector("input:not([type=checkbox])")!, { target: { value } })
  await runTool()
  expect(reply).not.toHaveBeenCalled()
  expect(screen.getByRole("alert").textContent).toBe(message)
})

test("the JSON editor shows and describes the UTF-8 limit, rejects oversized input and accepts the boundary", async () => {
  const { container, reply } = openTool({ type: "object", properties: { nested: { type: "object" } } })
  const editor = container.querySelector("textarea")!
  expect(editor.labels?.[0].textContent).toBe("webmcp.tools.jsonInput")
  expect(
    descriptions(editor)
      .map((node) => node.textContent)
      .join(" "),
  ).toContain("64 KiB (65,536 UTF-8 bytes")
  expect(descriptions(editor).map((node) => node.textContent)).toContain("webmcp.tools.jsonComplex")
  const input = { x: "é".repeat((65536 - 8) / 2) }
  fireEvent.change(editor, { target: { value: JSON.stringify({ x: input.x + "é" }) } })
  await runTool()
  expect(reply).not.toHaveBeenCalled()
  expect(screen.getByRole("status").textContent).toContain("chat.toolPart.webmcp.reason.input-too-large")
  expect(screen.getByRole("status").textContent).not.toContain("chat.toolPart.webmcp.reason.invalid-input")
  fireEvent.change(editor, { target: { value: JSON.stringify(input, null, 2) } })
  await runTool()
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, input, expect.objectContaining({ origin: expect.any(String) }))
})

test("panel and tool toggles expose aria-expanded and results update the persistent polite live region", async () => {
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog })
  const reply = vi.fn(async () => ({ ok: true, output: "done" }))
  const { container } = render(<WebMcpToolPanel tryTool={reply} />)
  const toggle = screen.getByRole("button", { name: "webmcp.tools.toggle:1" })
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(toggle)
  expect(toggle.getAttribute("aria-expanded")).toBe("true")
  const toolToggle = container.querySelector<HTMLButtonElement>("[data-webmcp-tool] button")!
  expect(toolToggle.getAttribute("aria-expanded")).toBe("false")
  fireEvent.click(toolToggle)
  expect(toolToggle.getAttribute("aria-expanded")).toBe("true")
  const live = screen.getByRole("status")
  expect(live.getAttribute("aria-live")).toBe("polite")
  expect(live.textContent).toBe("")
  for (const input of container.querySelectorAll("input")) fireEvent.change(input, { target: { value: "1" } })
  await runTool()
  expect(screen.getByRole("status")).toBe(live)
  expect(live.textContent).toContain("webmcp.tools.completed")
  expect(live.textContent).toContain("done")
  fireEvent.click(toolToggle)
  expect(toolToggle.getAttribute("aria-expanded")).toBe("false")
  expect(screen.queryByRole("status")).toBeNull()
  fireEvent.click(toggle)
  expect(toggle.getAttribute("aria-expanded")).toBe("false")
})

test("running keeps the send button focused and aria-disabled, guards repeat activation and allows another run", async () => {
  let resolve!: (result: import("./WebMcpToolPanel").TryResult) => void
  const reply = vi.fn(
    () =>
      new Promise<import("./WebMcpToolPanel").TryResult>((done) => {
        resolve = done
      }),
  )
  openTool(undefined, reply)
  const button = screen.getByRole("button", { name: "webmcp.tools.try" }) as HTMLButtonElement
  button.focus()
  fireEvent.click(button)
  expect(reply).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(button)
  expect(button.disabled).toBe(false)
  expect(button.getAttribute("aria-disabled")).toBe("true")
  expect(button.textContent).toBe("webmcp.tools.running")
  fireEvent.click(button)
  fireEvent.click(button)
  expect(reply).toHaveBeenCalledTimes(1)
  await act(async () => resolve({ ok: true, output: "done" }))
  expect(document.activeElement).toBe(button)
  expect(button.getAttribute("aria-disabled")).toBe("false")
  expect(button.textContent).toBe("webmcp.tools.try")
  fireEvent.click(button)
  expect(reply).toHaveBeenCalledTimes(2)
  await act(async () => resolve({ ok: true }))
})

test("shows the full description, raw schema, kind, hints, and advice without blocking try", async () => {
  const description = "Add two integers\nKeep the line break and this tail."
  useWebMcpBrowserStore.getState().updateSnapshot({
    origin: "https://shop.test",
    catalog: [
      {
        name: "add_numbers",
        description,
        kind: "form",
        annotations: { readOnlyHint: true, untrustedContent: true, consequentialHint: "yes", readOnly: false },
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title" },
            q: { type: "string", description: "Query", pattern: "^a" },
          },
        },
      },
    ],
  })
  const reply = vi.fn(async () => ({ ok: true, output: "done" }))
  const { container } = render(<WebMcpToolPanel tryTool={reply} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  expect(container.querySelector("[data-webmcp-tool-kind='form']")?.textContent).toContain("webmcp.tools.kind.form")
  expect(container.querySelector("[data-webmcp-hint='readOnlyHint']")).not.toBeNull()
  expect(container.querySelector("[data-webmcp-hint='untrustedContentHint']")).not.toBeNull()
  expect(container.querySelector("[data-webmcp-hint='consequentialHint']")).toBeNull()
  expect(container.textContent).toContain("webmcp.tools.hintsDoNotApprove")
  expect(container.textContent).toContain("webmcp.tools.origin:https://shop.test")
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
  const full = container.querySelector("[data-webmcp-description]")
  expect(full?.textContent).toBe(description)
  expect(full?.className).toContain("whitespace-pre-wrap")
  expect(full?.className.includes("truncate")).toBe(false)
  expect(container.querySelector("[data-webmcp-schema]")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.schema" }))
  const schema = container.querySelector("[data-webmcp-schema]")
  expect(schema?.getAttribute("aria-readonly")).toBe("true")
  expect(schema?.textContent).toContain('"pattern": "^a"')
  expect(schema?.querySelector("img, script")).toBeNull()
  expect(
    container.querySelector("[data-webmcp-lint='rejected-keyword']")?.getAttribute("data-webmcp-lint-keyword"),
  ).toBe("pattern")
  expect(container.textContent).toContain("webmcp.tools.lint.advice")
  await runTool()
  expect(reply).toHaveBeenCalledWith("add_numbers", {}, expect.objectContaining({ origin: expect.any(String) }))
  expect(screen.getAllByRole("status")).toHaveLength(1)
})

test("renders a hostile schema as text and says when a tool publishes none", () => {
  const { container } = openTool({ note: "<img src=x onerror=alert(1)>" })
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.schema" }))
  const schema = container.querySelector("[data-webmcp-schema]")
  expect(schema?.textContent).toContain("<img src=x onerror=alert(1)>")
  expect(schema?.querySelector("img")).toBeNull()
  expect(container.querySelector("img")).toBeNull()
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
  openTool(undefined)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.schema" }))
  expect(screen.getByText("webmcp.tools.schemaUnavailable")).toBeTruthy()
  expect(document.querySelector("[data-webmcp-schema]")).toBeNull()
})

test("says 64 of 65 and names a byte cap without putting the cap in the toggle name", () => {
  const catalog = Array.from({ length: 65 }, (_, index) => ({ name: `tool_${index}`, description: "Short" }))
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog })
  const view = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  expect(screen.getByRole("button", { name: "webmcp.tools.toggle:64" })).toBeTruthy()
  const count = view.container.querySelector("[data-webmcp-catalog-truncation='count']")
  expect(count?.textContent).toBe("webmcp.tools.truncated:64|65")
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
  useWebMcpBrowserStore.getState().updateSnapshot({
    origin: "https://shop.test",
    catalog: [{ name: "only", description: "Short" }],
    catalogLimit: { total: 4, shown: 1, truncation: "bytes" },
  })
  const bytes = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  expect(bytes.container.querySelector("[data-webmcp-catalog-truncation='bytes']")?.textContent).toBe(
    "webmcp.tools.truncated:1|4",
  )
})

test("names a rejected catalog, including a long name, and keeps the panel when no tool remains", () => {
  useWebMcpBrowserStore.getState().updateSnapshot({
    origin: "https://shop.test",
    catalog: [],
    catalogRejection: { code: "invalid-catalog", reason: "duplicate-name", tool: "echo" },
  })
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  expect(container.querySelector("[data-webmcp-tool-panel]")).not.toBeNull()
  const banner = container.querySelector("[data-webmcp-catalog-rejection='duplicate-name']")
  expect(banner?.getAttribute("role")).toBe("alert")
  expect(banner?.getAttribute("data-webmcp-catalog-rejection-tool")).toBe("echo")
  expect(banner?.textContent).toContain("webmcp.tools.rejection.duplicate-name:echo")
  expect(screen.getByRole("button", { name: "webmcp.tools.toggle:0" })).toBeTruthy()
  expect(screen.queryByRole("status")).toBeNull()
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
  useWebMcpBrowserStore.getState().updateSnapshot({
    origin: "https://shop.test",
    catalog: [],
    catalogRejection: { code: "invalid-catalog", reason: "invalid-name", tool: "n".repeat(300) },
  })
  const named = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  expect(
    named.container
      .querySelector("[data-webmcp-catalog-rejection-tool]")
      ?.getAttribute("data-webmcp-catalog-rejection-tool"),
  ).toBe("n".repeat(64))
  expect(named.container.querySelector("[data-webmcp-catalog-rejection='invalid-name']")).not.toBeNull()
})

test("keeps drafts for the same identity and leaves previous results behind on a definition change", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem")
  const tool = nativeWebMcpTool({
    name: "echo",
    description: "Echo",
    inputSchema: { type: "object", properties: { title: { type: "string", description: "Title" } } },
  })
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: [tool] })
  const reply = vi.fn(async () => ({ ok: true, output: "done" }))
  const { container } = render(<WebMcpToolPanel tryTool={reply} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  const added = container.querySelector("[data-webmcp-registration-kind='added']")
  const digest = useWebMcpBrowserStore.getState().catalog[0]?.digest ?? ""
  expect(added?.textContent).toContain(digest.slice(0, 12))
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  fireEvent.change(container.querySelector("input:not([type=checkbox])")!, { target: { value: "Ship" } })
  await runTool()
  expect(container.querySelector("[data-webmcp-stale]")).toBeNull()
  await act(async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ catalog: [] })
  })
  expect(container.querySelector("[data-webmcp-tool='echo']")).toBeNull()
  expect(container.querySelector("[data-webmcp-registration-kind='removed']")).not.toBeNull()
  await act(async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ catalog: [tool] })
  })
  expect(container.querySelector("[data-webmcp-registration-kind='removed']")).toBeNull()
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  expect(container.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.value).toBe("Ship")
  expect(container.querySelector("[data-webmcp-stale]")).toBeNull()
  await act(async () => {
    useWebMcpBrowserStore.getState().updateSnapshot({ catalog: [nativeWebMcpTool({ ...tool, description: "Echo revised" })] })
  })
  const changed = container.querySelector("[data-webmcp-registration-kind='changed']")
  expect(changed?.textContent).toContain(digest.slice(0, 12))
  expect(changed?.textContent).toContain(useWebMcpBrowserStore.getState().catalog[0]?.digest?.slice(0, 12))
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  expect(container.querySelector("[data-webmcp-tool-result]")).toBeNull()
  expect(container.querySelector("[data-webmcp-journal-entry] [data-webmcp-stale=true]")?.textContent).toBe("webmcp.tools.resultStale")
  expect(container.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.value).toBe("")
  expect(setItem).not.toHaveBeenCalled()
  setItem.mockRestore()
})

test("an enum warning names the allowed choices without blocking an explicit override", async () => {
  const { container, reply } = openTool({ type: "object", properties: { mode: { type: "string", enum: ["a", "b"] } } })
  const input = container.querySelector("select")!
  const unsupported = document.createElement("option")
  unsupported.value = "other"
  input.appendChild(unsupported)
  fireEvent.change(input, { target: { value: "other" } })
  await runTool()
  expect(reply).not.toHaveBeenCalled()
  expect(screen.getByRole("alert").textContent).toBe('Choose one of [\n  "a",\n  "b"\n] for mode.')
  await runTool("webmcp.tools.sendAnyway")
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { mode: "other" }, expect.objectContaining({ origin: expect.any(String) }))
})

test("selected tool forms restore per-view drafts and late manual results stay with the originating view", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  const initial = useWebMcpBrowserStore.getState()
  const store = () => useWebMcpBrowserStore.getState()
  const first = viewKeyFor("/repo", "ses_first")
  const second = viewKeyFor("/repo", "ses_second")
  let complete!: (result: { ok: boolean; output: string }) => void
  const tryTool = vi.fn(
    () =>
      new Promise<{ ok: boolean; output: string }>((resolve) => {
        complete = resolve
      }),
  )
  try {
    for (const session of ["ses_first", "ses_second"]) {
      store().selectView("/repo", session)
      store().updateSnapshot({ origin: "https://same.test", catalog })
    }
    store().updateView(first, {
      catalogRejection: { code: "invalid-catalog", reason: "duplicate-name", tool: "echo" },
      catalogLimit: { total: 65, shown: 1, truncation: "count" },
    })
    const view = render(<WebMcpToolPanel viewKey={first} tryTool={tryTool} />)
    expect(view.container.querySelector("[data-webmcp-catalog-rejection]")).not.toBeNull()
    expect(view.container.querySelector("[data-webmcp-catalog-truncation]")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
    fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
    fireEvent.change(a, { target: { value: "2" } })
    fireEvent.change(b, { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    expect(tryTool).toHaveBeenCalledWith(catalog[0].invocationID, { a: 2, b: 3 }, expect.objectContaining({ origin: expect.any(String) }))
    view.rerender(<WebMcpToolPanel viewKey={second} tryTool={tryTool} />)
    expect(view.container.querySelector("[data-webmcp-catalog-rejection]")).toBeNull()
    expect(view.container.querySelector("[data-webmcp-catalog-truncation]")).toBeNull()
    fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    expect([...view.container.querySelectorAll<HTMLInputElement>("input")].map((input) => input.value)).toEqual([
      "",
      "",
    ])
    await act(async () => {
      complete({ ok: true, output: "First result" })
    })
    expect(store().views[first].toolRuns[webMcpToolIdentity(catalog[0])!].text).toContain("First result")
    expect(store().views[second].toolRuns).toEqual({})
    expect(view.container.querySelector("[data-webmcp-tool-result]")).toBeNull()
    view.rerender(<WebMcpToolPanel viewKey={first} tryTool={tryTool} />)
    fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    expect([...view.container.querySelectorAll<HTMLInputElement>("input")].map((input) => input.value)).toEqual([
      "2",
      "3",
    ])
    expect(view.container.querySelector("[data-webmcp-tool-result='completed']")?.textContent).toContain("First result")
  } finally {
    cleanup()
    useWebMcpBrowserStore.setState(initial, true)
  }
})

test("a late manual result cannot repopulate the journal after navigating to another origin", async () => {
  const { viewKeyFor } = await import("@/lib/webMcpViewKey")
  const initial = useWebMcpBrowserStore.getState()
  const store = () => useWebMcpBrowserStore.getState()
  const key = viewKeyFor("/repo", "ses_first")
  let complete!: (result: { ok: boolean; output: string }) => void
  const tryTool = vi.fn(
    () =>
      new Promise<{ ok: boolean; output: string }>((resolve) => {
        complete = resolve
      }),
  )
  try {
    store().selectView("/repo", "ses_first")
    store().updateSnapshot({ origin: "https://staging.test", generation: "first", catalog })
    const view = render(<WebMcpToolPanel viewKey={key} tryTool={tryTool} />)
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
    fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
    const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
    fireEvent.change(a, { target: { value: "2" } })
    fireEvent.change(b, { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" }))
    await act(async () => {
      store().updateView(key, { origin: "https://production.test", generation: "second", catalog })
    })
    await act(async () => {
      complete({ ok: true, output: "staging result" })
    })
    expect(store().views[key].toolRuns).toEqual({})
    expect(store().views[key].toolJournal).toEqual([])
    expect(view.container.textContent).not.toContain("staging result")
  } finally {
    cleanup()
    useWebMcpBrowserStore.setState(initial, true)
  }
})

function pageCall(overrides: Partial<WebMcpCall>): WebMcpCall {
  return {
    id: "call-1",
    title: "add_numbers",
    toolName: "add_numbers",
    operation: "invoke",
    argumentsText: null,
    outcome: "failed",
    failureReason: "invalid-input",
    at: 1,
    messageId: "m1",
    partId: "call-1",
    callId: null,
    durationMs: 8,
    resultPreview: null,
    generation: null,
    argumentsMissing: false,
    definitionDigest: nativeWebMcpTool({ ...catalog[0], description: "Earlier definition" }).definitionDigest!,
    inputKind: "object",
    input: { a: 1, b: "nope" },
    ...overrides,
  }
}

const openAdd = (tryTool: TryTool, agentCalls?: readonly WebMcpCall[]) => {
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog })
  const view = render(<WebMcpToolPanel tryTool={tryTool} agentCalls={agentCalls} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
  return view
}

test("a manual journal keeps the sent run and replays it into editable fields without running", async () => {
  const tryTool = vi.fn(async () => ({ ok: true, output: "5" }))
  const view = openAdd(tryTool)
  expect(view.container.querySelector("[data-webmcp-journal-count]")?.getAttribute("data-webmcp-journal-count")).toBe(
    "0",
  )
  await runTool()
  expect(tryTool).not.toHaveBeenCalled()
  expect(view.container.querySelector("[data-webmcp-journal-entry]")).toBeNull()
  const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  fireEvent.change(a, { target: { value: "2" } })
  fireEvent.change(b, { target: { value: "3" } })
  await runTool()
  const entry = view.container.querySelector("[data-webmcp-journal-entry]")
  expect(entry?.getAttribute("data-webmcp-journal-tool")).toBe("add_numbers")
  expect(entry?.getAttribute("data-webmcp-journal-outcome")).toBe("completed")
  expect(entry?.getAttribute("data-webmcp-journal-digest")?.length).toBeGreaterThan(0)
  expect(view.container.querySelector("[data-webmcp-tool-result='completed']")).not.toBeNull()
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-replay]")!)
  expect(view.container.querySelector("[data-webmcp-tool-result='completed']")).not.toBeNull()
  expect(tryTool).toHaveBeenCalledTimes(1)
  const [nextA, nextB] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  expect([nextA.value, nextB.value]).toEqual(["2", "3"])
  fireEvent.change(nextA, { target: { value: "9" } })
  await runTool()
  expect(tryTool).toHaveBeenLastCalledWith(catalog[0].invocationID, { a: 9, b: 3 }, expect.objectContaining({ origin: expect.any(String) }))
  expect(view.container.querySelectorAll("[data-webmcp-journal-entry]")).toHaveLength(2)
  expect(JSON.stringify(localStorage)).not.toContain('"a": 9')
})

test("compare shows the transcript arguments beside the manual run and flags different definitions", async () => {
  const tryTool = vi.fn(async () => ({ ok: true, output: "5" }))
  const transcript = "CITY [redacted]"
  const view = openAdd(tryTool, [
    pageCall({ argumentsText: transcript, input: { a: 1, b: "nope" }, inputKind: "object" }),
  ])
  expect(view.container.querySelector("[data-webmcp-compare-agent-arguments]")?.textContent).toBe(transcript)
  const finding = view.container.querySelector("[data-webmcp-diagnosis='agent'] [data-webmcp-diagnosis-property='b']")
  expect(finding?.getAttribute("data-webmcp-diagnosis-rule")).toBe("type")
  expect(finding?.getAttribute("data-webmcp-diagnosis-kind")).toBe("string")
  expect(view.container.querySelector("[data-webmcp-definition-diff]")).toBeNull()
  const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  fireEvent.change(a, { target: { value: "2" } })
  fireEvent.change(b, { target: { value: "3" } })
  const tryButton = screen.getByRole("button", { name: "webmcp.tools.try" })
  expect(tryButton.getAttribute("aria-disabled")).not.toBe("true")
  await runTool()
  expect(tryTool).toHaveBeenCalledWith(catalog[0].invocationID, { a: 2, b: 3 }, expect.objectContaining({ origin: expect.any(String) }))
  expect(view.container.querySelector("[data-webmcp-compare-manual]")?.textContent).toContain('"a": 2')
  expect(view.container.querySelector("[data-webmcp-compare-agent-arguments]")?.textContent).toBe(transcript)
  // Mutation probe: this attribute is present only when the two known digests differ.
  expect(view.container.querySelector("[data-webmcp-definition-diff]")).not.toBeNull()
  const snippet = view.container.querySelector("[data-webmcp-export='manual'] [data-webmcp-export-snippet]")
  expect(snippet?.textContent).toContain("document.modelContext.executeTool")
  expect(snippet?.textContent).toContain("JSON.stringify(")
  expect(view.container.querySelector("[data-webmcp-export='manual'] [data-webmcp-export-run]")?.textContent).toContain(
    "--run ",
  )
  expect(view.container.querySelector("[data-webmcp-export='agent']")).toBeNull()
})

test("the same definition digest is not flagged, and a missing runtime input is not guessed", async () => {
  const digest = catalog[0].definitionDigest!
  expect(digest).not.toBe(catalog[0].digest)
  useWebMcpBrowserStore.getState().updateSnapshot({
    origin: "https://shop.test",
    catalog,
  })
  const tryTool = vi.fn(async () => ({ ok: true, output: "5" }))
  const view = render(
    <WebMcpToolPanel
      tryTool={tryTool}
      agentCalls={[
        pageCall({
          definitionDigest: digest,
          argumentsMissing: true,
          argumentsText: null,
          input: null,
          inputKind: "missing",
        }),
      ]}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
  const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  fireEvent.change(a, { target: { value: "2" } })
  fireEvent.change(b, { target: { value: "3" } })
  await runTool()
  expect(view.container.querySelector("[data-webmcp-definition-diff]")).toBeNull()
  expect(view.container.querySelector("[data-webmcp-definition-changed]")).toBeNull()
  expect(useWebMcpBrowserStore.getState().toolJournal[0].definitionDigest).toBe(digest)
  expect(view.container.querySelector("[data-webmcp-diagnosis='agent']")?.getAttribute("data-webmcp-diagnosis")).toBe(
    "agent",
  )
  expect(view.container.querySelector("[data-webmcp-diagnosis-gap='no-arguments']")).not.toBeNull()
  expect(view.container.querySelector("[data-webmcp-diagnosis='agent'] [data-webmcp-diagnosis-property]")).toBeNull()
  expect(view.container.querySelector("[data-webmcp-compare-agent]")?.textContent).toContain(
    "webmcp.tools.export.unavailable",
  )
  expect(tryTool).toHaveBeenCalledTimes(1)
})

test("a changed definition cannot claim or replay the earlier manual evidence", async () => {
  const tryTool = vi.fn(async () => ({ ok: true, output: "5" }))
  const view = openAdd(tryTool)
  const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  fireEvent.change(a, { target: { value: "2" } })
  fireEvent.change(b, { target: { value: "3" } })
  await runTool()
  act(() => {
    useWebMcpBrowserStore.getState().updateSnapshot({
      catalog: [nativeWebMcpTool({ ...catalog[0], description: "A different definition" })],
    })
  })
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
  expect(view.container.querySelector("[data-webmcp-compare-manual]")).toBeNull()
  expect(view.container.querySelector<HTMLButtonElement>("[data-webmcp-replay]")!.disabled).toBe(true)
  expect(view.container.querySelector("[data-webmcp-journal-entry]")).not.toBeNull()
})

test("a secret-named field is masked while typed", () => {
  useWebMcpBrowserStore.getState().updateSnapshot({
    origin: "https://shop.test",
    catalog: [
      {
        name: "sign_in",
        description: "Sign in",
        inputSchema: {
          type: "object",
          properties: { user: { type: "string" }, password: { type: "string" } },
          required: ["user"],
        },
      },
    ],
  })
  const view = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='sign_in'] button")!)
  const inputs = [...view.container.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])")]
  expect(inputs.map((input) => input.type)).toEqual(["text", "password"])
  cleanup()
  useWebMcpBrowserStore.getState().resetSnapshot()
})

test("the rendered manual error regression executes against the unchanged throwing tool", async () => {
  const reply = vi.fn(async (): Promise<import("./WebMcpToolPanel").TryResult> => ({
    ok: false, outcome: "application-error", reason: "application-error",
  }))
  const view = openTool({ type: "object", properties: {} }, reply)
  await runTool()
  expect(view.container.querySelector("[data-webmcp-journal-outcome='application-error']")).not.toBeNull()
  const snippet = view.container.querySelector("[data-webmcp-export='manual'] [data-webmcp-export-snippet]")!.textContent!
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const executeTool = vi.fn(async () => { throw new Error("unchanged failure") })
  await expect(new AsyncFunction("document", snippet)({ modelContext: {
    getTools: async () => [{ name: "echo" }], executeTool,
  } })).resolves.toBeUndefined()
  expect(executeTool).toHaveBeenCalledTimes(1)
})

test("recorded empty arguments enable structured comparison and a runnable agent export", async () => {
  const { collectWebMcpCalls } = await import("@/lib/webMcpCalls")
  const calls = collectWebMcpCalls([{ id: "m1" }], () => [{
    type: "tool", tool: "desktop_webmcp", state: {
      status: "completed", metadata: { operation: "invoke", toolName: "add_numbers", arguments: {} }, output: "{}",
    },
  }])
  const view = openAdd(vi.fn(), calls)
  expect(view.container.querySelector("[data-webmcp-compare-agent-arguments]")?.textContent).toBe("{}")
  expect(view.container.querySelector("[data-webmcp-diagnosis-gap='no-arguments']")).toBeNull()
  expect(view.container.querySelector("[data-webmcp-diagnosis='agent'] [data-webmcp-diagnosis-rule='required']")).not.toBeNull()
  const snippet = view.container.querySelector("[data-webmcp-export='agent'] [data-webmcp-export-snippet]")!.textContent!
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const executeTool = vi.fn(async () => "{}")
  await new AsyncFunction("document", snippet)({ modelContext: {
    getTools: async () => [{ name: "add_numbers" }], executeTool,
  } })
  expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ name: "add_numbers" }), "{}")
})

test("nested JSON credentials stay out of rendered manual results and copied exports", async () => {
  const secret = "AUDIT_FAKE_PASSWORD"
  const { container, reply } = openTool({ type: "object", properties: { payload: { type: "string" } } },
    vi.fn(async () => ({ ok: true, output: { content: [{ type: "text", text: JSON.stringify({ password: secret }) }] } })))
  fireEvent.change(container.querySelector("input")!, { target: { value: JSON.stringify({ password: secret }) } })
  await runTool()
  expect(reply).toHaveBeenCalledOnce()
  const snippet = container.querySelector("[data-webmcp-export='manual'] [data-webmcp-export-snippet]")
  expect(snippet).not.toBeNull()
  expect(snippet?.textContent).not.toContain(secret)
  expect(snippet?.textContent).toContain("<fill in>")
  expect(container.querySelector("[data-webmcp-tool-result]")?.textContent).not.toContain(secret)
  expect(container.querySelector("[data-webmcp-tool-result]")?.textContent).toContain("[redacted]")
})

test("redacted receipt values are uncheckable while ordinary properties still get diagnosis", () => {
  const inputSchema = { type: "object", properties: { password: { type: "string", minLength: 12 }, count: { type: "integer" } } }
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: [nativeWebMcpTool({ name: "echo", description: "Echo", inputSchema })] })
  const view = render(<WebMcpToolPanel tryTool={vi.fn()} agentCalls={[pageCall({ toolName: "echo", input: { password: "[redacted]", count: "bad" } })]} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  expect(view.container.querySelector("[data-webmcp-diagnosis-property='password']")).toBeNull()
  expect(view.container.querySelector("[data-webmcp-diagnosis-gap='redacted']")).not.toBeNull()
  expect(view.container.querySelector("[data-webmcp-diagnosis-property='count']")?.getAttribute("data-webmcp-diagnosis-rule")).toBe("type")
})

test.each([
  "completed",
  "application-error",
  "timeout",
  "cancelled",
  "failed",
  "uncertain",
  "stale-form",
  "invalid-input",
])("manual outcome %s offers copy only when the standalone classifier can reproduce it", async (outcome) => {
  const { container } = openTool(
    { type: "object", properties: {} },
    vi.fn(async () => ({ ok: outcome === "completed", outcome })),
  )
  await runTool()
  expect(container.querySelector(`[data-webmcp-journal-outcome='${outcome}']`)).not.toBeNull()
  const supported = ["completed", "application-error"].includes(outcome)
  expect(container.querySelector("[data-webmcp-export='manual']") !== null).toBe(supported)
  expect(
    [...container.querySelectorAll("button")].some((button) => button.textContent === "webmcp.tools.export.copyTest"),
  ).toBe(supported)
})

test.each([
  'Validation failed: {"password":"AUDIT_FAKE_PASSWORD"}',
  '```json\n{"password":"AUDIT_FAKE_PASSWORD"}\n```',
])("embedded diagnostics stay out of rendered previews and exports: %s", async (text) => {
  const { container } = openTool(
    { type: "object", properties: { payload: { type: "string" } } },
    vi.fn(async () => ({ ok: true, output: { error: text } })),
  )
  fireEvent.change(container.querySelector("input")!, { target: { value: text } })
  await runTool()
  expect(container.textContent).not.toContain("AUDIT_FAKE_PASSWORD")
  expect(container.querySelector("[data-webmcp-export-snippet]")?.textContent).toContain("<fill in>")
  expect(container.querySelector("[data-webmcp-tool-result]")?.textContent).toContain("[redacted]")
})


test.each(["frame", "missing-current", "missing-agent"])("comparison uses only known native identities: %s", async (change) => {
  const original = catalog[0]
  const current = change === "frame"
    ? nativeWebMcpTool(original, "replacement-frame")
    : change === "missing-current" ? { ...original, definitionDigest: undefined } : original
  expect(current.digest).toBe(original.digest)
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: [current] })
  const view = render(<WebMcpToolPanel
    tryTool={vi.fn(async () => ({ ok: true, output: "5" }))}
    agentCalls={[pageCall({ definitionDigest: change === "missing-agent" ? null : original.definitionDigest! })]}
  />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(view.container.querySelector<HTMLButtonElement>("[data-webmcp-tool='add_numbers'] button")!)
  const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  fireEvent.change(a, { target: { value: "2" } })
  fireEvent.change(b, { target: { value: "3" } })
  await runTool()
  expect(Boolean(view.container.querySelector("[data-webmcp-definition-diff]"))).toBe(change === "frame")
  expect(Boolean(view.container.querySelector("[data-webmcp-definition-changed='agent']"))).toBe(change === "frame")
  expect(view.container.querySelector("[data-webmcp-definition-changed='manual']")).toBeNull()
})

test.each([
  "password=AUDIT_FAKE_PASSWORD",
  "https://u:AUDIT_FAKE_PASSWORD@example.test/",
  "https://example.test/?%74oken=AUDIT_FAKE_PASSWORD",
])("all page-authored display surfaces redact credentials without altering execution: %s", async (description) => {
  const secret = "AUDIT_FAKE_PASSWORD"
  const url = `https://example.test/?%74oken=${secret}`
  const tool = nativeWebMcpTool({
    name: "echo",
    description,
    inputSchema: {
      type: "object",
      properties: {
        password: { type: "string", default: secret, enum: [secret] },
        url: { type: "string", description: `${"x".repeat(295)} ${url}`, default: url, enum: [url] },
        [`password=${secret}`]: { type: "string" },
        safe: { type: "string", description: "Safe description", default: "Safe default" },
      },
    },
  })
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: [tool] })
  const tryTool = vi.fn(async () => ({ ok: true }))
  const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  expect(container.querySelector("[title]")?.getAttribute("title")).toBe("[redacted]")
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.schema" }))
  expect(container.innerHTML).not.toContain(secret)
  expect(container.textContent).toContain("Safe description")
  expect(container.textContent).toContain("Safe default")
  expect(container.querySelector("[data-webmcp-schema]")?.textContent).toContain("[redacted]")
  const selects = container.querySelectorAll<HTMLSelectElement>("select")
  fireEvent.change(selects[0], { target: { value: selects[0].options[1].value } })
  fireEvent.change(selects[1], { target: { value: selects[1].options[1].value } })
  await runTool()
  expect(tryTool).toHaveBeenCalledWith(
    tool.invocationID,
    { password: secret, url },
    expect.objectContaining({ definitionDigest: tool.definitionDigest }),
  )
  expect(useWebMcpBrowserStore.getState().catalog[0]).toMatchObject(tool)
  expect(container.innerHTML).not.toContain(secret)
})

test("a sent manual call survives registration retirement during execution", async () => {
  let finish!: (value: { ok: boolean; output: string }) => void
  const tryTool = vi.fn(() => new Promise<{ ok: boolean; output: string }>((resolve) => { finish = resolve }))
  const view = openAdd(tryTool)
  const [a, b] = [...view.container.querySelectorAll<HTMLInputElement>("input")]
  fireEvent.change(a, { target: { value: "2" } })
  fireEvent.change(b, { target: { value: "3" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" })) })
  act(() => { useWebMcpBrowserStore.getState().updateSnapshot({ generation: "retired", catalog: [] }) })
  await act(async () => { finish({ ok: true, output: "done" }) })
  expect(useWebMcpBrowserStore.getState().toolJournal[0]).toMatchObject({ outcome: "completed", definitionChanged: true, text: expect.stringContaining("done") })
  expect(view.container.querySelector("[data-webmcp-journal-definition-changed='true']")).not.toBeNull()
})

test.each([['pin', 'integer', '1234', 1234], ['cvv', 'number', '123.5', 123.5]])(
  'masks numeric credential %s and sends its schema value type', async (name, type, typed, expected) => {
    const { container, reply } = openTool({ type: 'object', properties: { [name]: { type } }, required: [name] })
    const input = container.querySelector('input')!
    expect(input.type).toBe('password')
    expect(input.autocomplete).toBe('off')
    fireEvent.change(input, { target: { value: typed } })
    await runTool()
    expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { [name]: expected }, expect.any(Object))
  },
)

 test("accepted descriptions retain their final instructions in collapsed and expanded displays", () => {
  const description = "d".repeat(4046) + " final builder instructions".padEnd(50, ".")
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: [nativeWebMcpTool({ name: "echo", description, inputSchema: {} })] })
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  expect(container.querySelector("[title]")?.getAttribute("title")).toBe(description)
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  expect(container.querySelector("[data-webmcp-description]")?.textContent).toBe(description)
})

test.each([false, true])("long enum values keep exact executable identity, collision=%s", async (collision) => {
  const first = "a".repeat(4100)
  const second = "a".repeat(4000) + "b".repeat(100)
  const { container, reply } = openTool({ type: "object", properties: { choice: { type: "string", enum: collision ? [first, second] : [first] } }, required: ["choice"] })
  const select = container.querySelector("select")!
  const index = collision ? 2 : 1
  expect(select.options[index].textContent!.length).toBeLessThanOrEqual(4000)
  fireEvent.change(select, { target: { value: select.options[index].value } })
  await runTool()
  expect(reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { choice: collision ? second : first }, expect.anything())
})

test.each([true, false])("JSON masks nested sensitive schemas and sensitive drafts, schema=%s", async (sensitiveSchema) => {
  const schema = { type: "object", properties: { auth: { type: "object", properties: { [sensitiveSchema ? "password" : "name"]: { type: "string" } } } } }
  const view = openTool(schema)
  const editor = view.container.querySelector("textarea")!
  if (sensitiveSchema) expect(editor.style.getPropertyValue("-webkit-text-security")).toBe("disc")
  fireEvent.change(editor, { target: { value: '{"auth":{"password":"example-credential-123"}}' } })
  expect(editor.style.getPropertyValue("-webkit-text-security")).toBe("disc")
  expect(editor.autocomplete).toBe("off")
  expect(editor.getAttribute("spellcheck")).toBe("false")
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.showJson" }))
  expect(editor.style.getPropertyValue("-webkit-text-security")).toBe("")
  await runTool()
  expect(view.reply).toHaveBeenCalledWith(useWebMcpBrowserStore.getState().catalog[0].invocationID, { auth: { password: "example-credential-123" } }, expect.anything())
  cleanup()
  const restored = openTool(schema).container.querySelector("textarea")!
  expect(restored.value).toContain("example-credential-123")
  expect(restored.style.getPropertyValue("-webkit-text-security")).toBe("disc")
})


test("Use JSON on a primitive schema masks credential-shaped draft text", () => {
  const { container } = openTool({ type: "object", properties: { text: { type: "string" } } })
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.useJson" }))
  const editor = container.querySelector("textarea")!
  fireEvent.change(editor, { target: { value: '{"text":"API key: example-credential-123"}' } })
  expect(editor.style.getPropertyValue("-webkit-text-security")).toBe("disc")
  expect(screen.getByRole("button", { name: "webmcp.tools.showJson" })).toBeTruthy()
})

test.each(compoundKeys)("compound credential %s is masked before opaque input", (name) => {
  const { container } = openTool({ type: "object", properties: { [name]: { type: "string" } } })
  const input = container.querySelector("input")!
  expect(input.type).toBe("password")
  expect(input.autocomplete).toBe("off")
})

import { propertyDiff } from "@/lib/webMcpPropertyDiff"
test("registration retains accepted definitions and renders property changes across reload", () => {
  const old = nativeWebMcpTool({ name: "echo", description: "Echo", inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string", enum: ["old"], description: "Before" }, removed: { type: "number" } } } })
  const next = nativeWebMcpTool({ name: "echo", description: "Echo", inputSchema: { type: "object", properties: { title: { type: "number", enum: [1], description: "After" }, added: { type: "boolean" } } } })
  const store = useWebMcpBrowserStore.getState()
  store.updateSnapshot({ origin: "https://shop.test", catalog: [old] })
  store.updateSnapshot({ catalog: [] })
  store.updateSnapshot({ catalog: [next] })
  const event = useWebMcpBrowserStore.getState().registration.at(-1)!
  expect(event.previousDefinition?.definitionDigest).toBe(old.definitionDigest)
  expect(propertyDiff(event.previousDefinition?.inputSchema, event.definition?.inputSchema)).toEqual(expect.arrayContaining([
    expect.objectContaining({ property: "title", change: "changed", fields: ["type", "enum", "description", "required"] }),
    expect.objectContaining({ property: "removed", change: "removed" }), expect.objectContaining({ property: "added", change: "added" }),
  ]))
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  expect(container.querySelector("[data-webmcp-property-diff]")?.textContent).toContain('"removed"')
})

test("credential-shaped tool names use the opaque invocation id and display redacted results", async () => {
  const tool = nativeWebMcpTool({ name: "token=TOOL_NAME_SECRET", description: "Echo", inputSchema: { type: "object", properties: {} } })
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", generation: "page-1", catalog: [{ ...tool, invocationID: "a".repeat(64) }] })
  const tryTool = vi.fn(async () => ({ ok: true, output: { name: tool.name } }))
  const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool] button")!)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.try" })))
  expect(tryTool).toHaveBeenCalledWith("a".repeat(64), {}, expect.anything())
  expect(container.innerHTML).not.toContain("TOOL_NAME_SECRET")
  expect(container.querySelector("[data-webmcp-tool-result]")?.textContent).toContain("[redacted]")
  expect(container.querySelector("[data-webmcp-tool-result-name]")?.textContent).toBe("[redacted]")
})

test.each([false, true])("runtime previews diagnose the digest-named historical schema (%s truncated)", async (truncated) => {
  const old = nativeWebMcpTool({ name: "echo", description: "Earlier", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } })
  const current = nativeWebMcpTool({ name: "echo", description: "Now", inputSchema: { type: "object", properties: { title: { type: "integer" } } } })
  const store = useWebMcpBrowserStore.getState()
  store.updateSnapshot({ origin: "https://shop.test", catalog: [old] })
  store.updateSnapshot({ catalog: [current] })
  const { collectWebMcpCalls } = await import("@/lib/webMcpCalls")
  const calls = collectWebMcpCalls([{ id: "m1" }], () => [{ type: "tool", tool: "desktop_webmcp", state: {
    status: "completed", metadata: { requireInteractive: false, desktopProvider: true, origin: "https://shop.test", operation: "invoke", toolName: "echo", providerID: "provider-1", generation: "page-1", definitionDigest: old.definitionDigest,
      inputPreview: truncated ? '{"title":"Ship… (4096 bytes, 2048 not shown)' : '{"title":"Ship"}' }, output: "{}",
  } }])
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} agentCalls={calls} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool] button")!)
  if (truncated) {
    expect(container.querySelector("[data-webmcp-diagnosis-gap='truncated']")?.textContent).toContain("diagnosis.truncated")
    expect(container.querySelector("[data-webmcp-compare-agent-arguments]")?.textContent).toContain("… (4096 bytes, 2048 not shown)")
  } else {
    expect(container.querySelector("[data-webmcp-diagnosis='agent']")?.textContent).toContain("diagnosis.none")
    expect(container.querySelector("[data-webmcp-diagnosis-property='title']")).toBeNull()
  }
})

test("property diffs include changes beyond the preview text limit", () => {
  const before = nativeWebMcpTool({ name: "echo", description: "Before", inputSchema: { type: "object", properties: {} } })
  const properties = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [`property_${index}`, { type: "string", description: "A changed description ".repeat(8) }]))
  const after = nativeWebMcpTool({ name: "echo", description: "After", inputSchema: { type: "object", properties } })
  const store = useWebMcpBrowserStore.getState()
  store.updateSnapshot({ origin: "https://shop.test", catalog: [before] })
  store.updateSnapshot({ catalog: [after] })
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  const text = container.querySelector("[data-webmcp-property-diff]")!.textContent!
  expect(text.length).toBeGreaterThan(4000)
  expect(JSON.parse(text)).toHaveLength(35)
  expect(text).toContain("property_34")
})

test("redacted tool labels keep manual evidence, drafts and replay bound to their native identities", async () => {
  const inputSchema = { type: "object", properties: { item: { type: "string" } }, required: ["item"] }
  const tools = [
    { name: "token=alpha", description: "First tool", inputSchema },
    { name: "token=beta", description: "Second tool", inputSchema },
  ].map(projectedWebMcpTool)
  expect(tools.map((tool: { name: string }) => tool.name)).toEqual(["[redacted]", "[redacted]"])
  expect(tools[0].invocationID).not.toBe(tools[1].invocationID)
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: tools })
  const tryTool = vi.fn(async (id: string) => ({ ok: true, output: id === tools[0].invocationID ? "effect A" : "effect B" }))
  const view = render(<WebMcpToolPanel tryTool={tryTool} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:2" }))
  const [first, second] = [...view.container.querySelectorAll<HTMLElement>("[data-webmcp-tool]")]
  fireEvent.click(first.querySelector("button")!)
  fireEvent.click(second.querySelector("button")!)
  const run = async (item: HTMLElement, input: string) => {
    fireEvent.change(item.querySelector("input")!, { target: { value: input } })
    await act(async () => {
      fireEvent.click([...item.querySelectorAll("button")].find((button) => button.textContent === "webmcp.tools.try")!)
    })
  }
  await run(first, "from A")
  const entryA = useWebMcpBrowserStore.getState().toolJournal[0]
  expect(entryA).toMatchObject({ invocationID: tools[0].invocationID, definitionDigest: tools[0].definitionDigest })
  expect(first.querySelector("[data-webmcp-compare-manual]")?.textContent).toContain("from A")
  expect(second.querySelector("[data-webmcp-compare]")).toBeNull()
  expect(second.querySelector("[data-webmcp-tool-result]")).toBeNull()
  expect(second.querySelector("[data-webmcp-diagnosis]")).toBeNull()
  await run(second, "from B")
  expect(tryTool).toHaveBeenNthCalledWith(1, tools[0].invocationID, { item: "from A" }, expect.anything())
  expect(tryTool).toHaveBeenNthCalledWith(2, tools[1].invocationID, { item: "from B" }, expect.anything())
  for (const [item, own, other] of [[first, "A", "B"], [second, "B", "A"]] as const) {
    const evidence = item.querySelector("[data-webmcp-compare-manual]")!
    expect(evidence.textContent).toContain(`from ${own}`)
    expect(evidence.textContent).toContain(`effect ${own}`)
    expect(evidence.textContent).not.toContain(`from ${other}`)
    expect(evidence.querySelector("[data-webmcp-diagnosis='manual']")).not.toBeNull()
    expect(evidence.textContent).toContain("webmcp.tools.export.unavailable")
    expect(item.querySelector("[data-webmcp-export]")).toBeNull()
    fireEvent.change(item.querySelector("input")!, { target: { value: `edited ${own}` } })
  }
  fireEvent.click(view.container.querySelector(`[data-webmcp-replay='${entryA.id}']`)!)
  expect(first.querySelector<HTMLInputElement>("input")!.value).toBe("from A")
  expect(second.querySelector<HTMLInputElement>("input")!.value).toBe("edited B")
  expect(tryTool).toHaveBeenCalledTimes(2)
  expect(view.container.querySelector("[data-webmcp-export-run]")).toBeNull()
  expect(view.container.innerHTML).not.toMatch(/token=alpha|token=beta/)

  cleanup()
  const remounted = render(<WebMcpToolPanel tryTool={tryTool} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:2" }))
  const rows = [...remounted.container.querySelectorAll<HTMLElement>("[data-webmcp-tool]")]
  for (const row of rows) fireEvent.click(row.querySelector("button")!)
  expect(rows[0].querySelector<HTMLInputElement>("input")!.value).toBe("from A")
  expect(rows[1].querySelector<HTMLInputElement>("input")!.value).toBe("edited B")
  expect(rows[0].querySelector("[data-webmcp-compare-manual]")?.textContent).toContain("effect A")
  expect(rows[1].querySelector("[data-webmcp-compare-manual]")?.textContent).toContain("effect B")
})

test("the bounded catalog schema never changes executable keys or colliding enum values", async () => {
  const key = "k".repeat(4100)
  const first = "a".repeat(4100)
  const second = "a".repeat(4000) + "b".repeat(100)
  const schema = { type: "object", properties: { [key]: { type: "string", enum: [first, second], description: "token=SCHEMA_SECRET" } } }
  const projected = [projectedWebMcpTool({ name: "echo", description: "Echo", inputSchema: schema })]
  expect(projected[0].inputSchema).toEqual({ type: "object", properties: { [key.slice(0, 4000)]: { type: "string", enum: [first.slice(0, 4000), second.slice(0, 4000)], description: "[redacted]" } } })
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: projected })
  const tryTool = vi.fn(async () => ({ ok: true, output: "done" }))
  const { container } = render(<WebMcpToolPanel tryTool={tryTool} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(container.querySelector("[data-webmcp-tool] button")!)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.schema" }))
  expect(container.innerHTML).not.toContain("SCHEMA_SECRET")
  const select = container.querySelector<HTMLSelectElement>("select")!
  fireEvent.change(select, { target: { value: select.options[2].value } })
  await runTool()
  expect(tryTool).toHaveBeenCalledWith(projected[0].invocationID, { [key]: second }, expect.anything())
  expect(container.querySelector("[data-webmcp-diagnosis='manual']")?.textContent).toContain("webmcp.tools.diagnosis.none")
})


test("registration diffs redact original password enums before display transformation", () => {
  const make = (value: string) => projectedWebMcpTool({ name: "echo", description: "Echo", inputSchema: {
    type: "object", properties: { password: { type: "string", enum: [value] } },
  } })
  const store = useWebMcpBrowserStore.getState()
  store.updateSnapshot({ origin: "https://shop.test", catalog: [make("synthetic-old-password")] })
  store.updateSnapshot({ catalog: [make("synthetic-new-password")] })
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  const diff = container.querySelector("[data-webmcp-property-diff]")!.textContent!
  expect(diff).toContain('"enum"')
  expect(diff).toContain('"before": "[redacted]"')
  expect(diff).toContain('"after": "[redacted]"')
  expect(container.textContent).not.toContain("synthetic-old-password")
  expect(container.textContent).not.toContain("synthetic-new-password")
})

test("input schema hides values whose sensitive key suffix exceeds the projection bound", () => {
  const key = "x".repeat(4000) + "password"
  const tool = projectedWebMcpTool({ name: "echo", description: "Echo", inputSchema: {
    type: "object", properties: { [key]: { type: "string", default: "synthetic-password" } },
  } })
  useWebMcpBrowserStore.getState().updateSnapshot({ origin: "https://shop.test", catalog: [tool] })
  const { container } = render(<WebMcpToolPanel tryTool={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.toggle:1" }))
  fireEvent.click(container.querySelector<HTMLButtonElement>("[data-webmcp-tool='echo'] button")!)
  fireEvent.click(screen.getByRole("button", { name: "webmcp.tools.schema" }))
  const schema = container.querySelector("[data-webmcp-schema]")!.textContent!
  expect(schema).toContain("[redacted secret]")
  expect(schema).not.toContain("synthetic-password")
})
