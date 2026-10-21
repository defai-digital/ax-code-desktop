import { expect, test, vi } from "vitest"
import { redactWebMcpReport } from "../../../shared/webmcp-redaction.mjs"

test.each([
  'Response: {"password":"synthetic-private-value"}',
  '{"api_key":"synthetic-private-value",',
  "Response: {'token':'synthetic-private-value'} trailing text",
])("redacts credential-bearing JSON fragments: %s", (text) => {
  expect(redactWebMcpReport(text)).not.toContain("synthetic-private-value")
})

test("redacts repeatedly encoded JSON strings without losing their wire type", () => {
  let value = JSON.stringify({ password: "synthetic-private-value", label: "kept" })
  for (let index = 0; index < 3; index++) value = JSON.stringify(value)
  let safe = redactWebMcpReport(value)
  expect(safe).not.toContain("synthetic-private-value")
  for (let index = 0; index < 4; index++) safe = JSON.parse(safe)
  expect(safe).toEqual({ password: "[redacted]", label: "kept" })
})

test("deep and cyclic reports fail closed without throwing or exposing values", () => {
  const cycle = { label: "kept", password: "synthetic-private-value" }
  cycle.self = cycle
  expect(() => redactWebMcpReport(cycle)).not.toThrow()
  const safe = redactWebMcpReport(cycle)
  expect(safe.label).toBe("kept")
  expect(JSON.stringify(safe)).not.toContain("synthetic-private-value")
  const deep = "[".repeat(10000) + '"synthetic-private-value"' + "]".repeat(10000)
  expect(() => redactWebMcpReport(deep)).not.toThrow()
  expect(redactWebMcpReport(deep)).not.toContain("synthetic-private-value")
})

test("ordinary encoded data preserves whitespace, large integers and repeated references", () => {
  const encoded = '{ "large": 9007199254740993, "label": "kept" }'
  expect(redactWebMcpReport(encoded)).toBe(encoded)
  const emptyCredentials = '{ "password": "", "token": null }'
  expect(redactWebMcpReport(emptyCredentials)).toBe(emptyCredentials)
  const child = { label: "kept" }
  expect(redactWebMcpReport({ a: child, b: child })).toEqual({ a: child, b: child })
})


test("shared-reference fan-out is bounded before returning an exponential projection", () => {
  let value = { label: "synthetic-private-value" }
  for (let index = 0; index < 18; index++) value = { a: value, b: value }
  expect(redactWebMcpReport(value)).toBe("[redacted]")
})

test("non-syntax JSON parser failures cannot return the unfiltered source", () => {
  const parse = vi.spyOn(JSON, "parse").mockImplementation(() => { throw new RangeError("fixture parser failure") })
  try {
    expect(redactWebMcpReport("synthetic-private-value")).toBe("[redacted]")
  } finally {
    parse.mockRestore()
  }
})


test.each([
  "Response: {\"db_password\":\"synthetic-private-value\"}",
  "Response: {\"accessToken\":\"synthetic-private-value\"}",
  "Response: {\"refresh_token\":\"synthetic-private-value\"}",
  "Response: {\"client_secret\":\"synthetic-private-value\"}",
  "Response: {\"openai_api_key\":\"synthetic-private-value\"}",
  "Response: {\"secretKey\":\"synthetic-private-value\"}",
  "Response: {\"passwordHash\":\"synthetic-private-value\"}",
  "Response: {\"pass\\u0077ord\":\"synthetic-private-value\"}"
])("compound and escaped credential names in fragments stay private: %s", (value) => {
  expect(redactWebMcpReport(value)).not.toContain("synthetic-private-value")
})

test("successive escape layers have a bounded fail-closed detection path", () => {
  const value = String.raw`\u005c` + "u005c".repeat(100) + "u0061"
  expect(redactWebMcpReport(value)).toBe("[redacted]")
})
