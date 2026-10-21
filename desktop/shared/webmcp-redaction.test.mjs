import assert from "node:assert/strict"
import { test } from "node:test"
import { redactWebMcpReport, webMcpTextLooksSensitive } from "./webmcp-redaction.mjs"
import { credentialTextCases, secret } from "./testing/webmcp-redaction-cases.mjs"

test("embedded credential assignments are filtered across every generated shape", () => {
  for (const text of credentialTextCases) {
    assert.equal(webMcpTextLooksSensitive(text), true, text)
    for (const value of [text, { error: text }, { nested: [JSON.stringify({ message: text })] }]) {
      assert.ok(!JSON.stringify(redactWebMcpReport(value)).includes(secret), text)
      assert.ok(!JSON.stringify(redactWebMcpReport(value, "<fill in>")).includes(secret), text)
    }
  }
})

test("ordinary diagnostics and credential labels without values remain readable", () => {
  for (const text of ["Password", 'Validation failed: {"title":"short"}', "count=3", "a".repeat(65536), '```json\n{"value":true}\n```']) {
    assert.equal(webMcpTextLooksSensitive(text), false)
    assert.equal(redactWebMcpReport(text), text)
  }
})
