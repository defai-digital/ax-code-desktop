import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { assertValidParamsDeclaration, indexContract, validateCommandArgs } = require("./ipc-args.js")
const contract = require("./desktop-ipc-contract.json")

const entry = (params) => ({ command: "desktop_example", safeForRemote: false, args: "object", params })

describe("validateCommandArgs", () => {
  test("passes commands without params through unchanged", () => {
    expect(validateCommandArgs({ command: "x", args: "object" }, { anything: 1 })).toEqual({ ok: true })
    expect(validateCommandArgs(undefined, null)).toEqual({ ok: true })
  })

  test("checks each declared type", () => {
    const cases = [
      ["string", "a", 1],
      ["number", 1.5, Number.NaN],
      ["integer", 2, 2.5],
      ["boolean", false, "false"],
      ["object", { a: 1 }, [1]],
      ["array", [1], { 0: 1 }],
      ["string[]", ["a"], ["a", 1]],
    ]
    for (const [type, good, bad] of cases) {
      expect(validateCommandArgs(entry({ value: { type } }), { value: good }), type).toEqual({ ok: true })
      expect(validateCommandArgs(entry({ value: { type } }), { value: bad }).ok, type).toBe(false)
    }
  })

  test("applies required, optional, nullable, maxLength and enum", () => {
    const schema = entry({
      id: { type: "string", maxLength: 3 },
      note: { type: "string", optional: true, nullable: true },
      mode: { type: "string", optional: true, enum: ["draft", "session"] },
    })
    expect(validateCommandArgs(schema, { id: "abc" })).toEqual({ ok: true })
    expect(validateCommandArgs(schema, {})).toEqual({ ok: false, error: "id is required" })
    expect(validateCommandArgs(schema, { id: "abcd" })).toEqual({ ok: false, error: "id is longer than 3" })
    expect(validateCommandArgs(schema, { id: "a", note: null })).toEqual({ ok: true })
    expect(validateCommandArgs(schema, { id: null })).toEqual({ ok: false, error: "id must not be null" })
    expect(validateCommandArgs(schema, { id: "a", mode: "other" }).ok).toBe(false)
    expect(validateCommandArgs(schema, { id: "a", mode: undefined })).toEqual({ ok: true })
  })

  test("ignores undeclared keys so older renderers keep working", () => {
    expect(validateCommandArgs(entry({ id: { type: "string" } }), { id: "a", legacy: true })).toEqual({ ok: true })
  })

  test("rejects a non-object argument bag", () => {
    expect(validateCommandArgs(entry({}), ["a"])).toEqual({ ok: false, error: "expected an object, got array" })
  })
})

describe("contract declarations", () => {
  test("rejects malformed params blocks", () => {
    expect(() => assertValidParamsDeclaration({ command: "c", args: "none", params: {} })).toThrow(/args "object"/)
    expect(() => assertValidParamsDeclaration(entry({ a: { type: "date" } }))).toThrow(/unknown type/)
    expect(() => assertValidParamsDeclaration(entry({ a: { type: "number", enum: [1] } }))).toThrow(/enum/)
    expect(() => assertValidParamsDeclaration(entry({ a: { type: "string", maxLength: -1 } }))).toThrow(/maxLength/)
    expect(() => assertValidParamsDeclaration(entry({ a: { type: "number", maxLength: 8 } }))).toThrow(
      /only to strings and arrays/,
    )
  })

  test("the shipped contract is well formed", () => {
    expect(contract.version).toBe(2)
    const indexed = indexContract(contract)
    expect(indexed.size).toBe(contract.commands.length)
  })
})

test("WebMCP pool commands extend the existing local-only channel without invalidating old pane arguments", () => {
  const entry = contract.commands.find((command) => command.command === "desktop_webmcp_browser")
  expect(entry.safeForRemote).toBe(false)
  for (const args of [
    { action: "list" },
    { action: "show", id: "view" },
    { action: "create", directory: "/repo", sessionID: null, url: "about:blank" },
    { action: "bounds", id: "view", x: 0, y: 0, width: 100, height: 100 },
    { action: "tryTool", id: "view", toolName: "echo", input: { message: "test" } },
    { action: "revokeSession", directory: "/repo", sessionID: "ses_one" },
    { action: "clearProject", directory: "/repo" },
  ])
    expect(validateCommandArgs(entry, args)).toEqual({ ok: true })
  expect(validateCommandArgs(entry, { action: "unknown" }).ok).toBe(false)
})
