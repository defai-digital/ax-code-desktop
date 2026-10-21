import assert from "node:assert/strict"
import { test } from "node:test"
import {
  WEBMCP_SENSITIVE_NAME,
  webMcpSchemaLooksSensitive,
  redactWebMcpText,
  redactWebMcpReport,
  webMcpTextLooksSensitive,
  webMcpDisplayDescription,
} from "./webmcp-redaction.mjs"
import { compoundKeys, credentialTextCases, credentialUrlShapes, secret } from "./testing/webmcp-redaction-cases.mjs"

test("embedded credential assignments are filtered across every generated shape", () => {
  for (const text of credentialTextCases) {
    assert.equal(webMcpTextLooksSensitive(text), true, text)
    assert.equal(redactWebMcpText(text), "[redacted]", text)
    for (const value of [text, { error: text }, { nested: [JSON.stringify({ message: text })] }]) {
      assert.ok(!JSON.stringify(redactWebMcpReport(value)).includes(secret), text)
      assert.ok(!JSON.stringify(redactWebMcpReport(value, "<fill in>")).includes(secret), text)
    }
  }
})

test("ordinary diagnostics and credential labels without values remain readable", () => {
  for (const text of [
    "code=5",
    "code=true",
    "state=ready",
    "?code=5",
    "https://example.test/code=5",
    '{"code":5,"state":true}',
    "Password",
    "https://example.test/?%73ort=name#%66ilter=active",
    "/route;%70age=2",
    'Validation failed: {"title":"short"}',
    "count=3",
    "a".repeat(65536),
    '```json\n{"value":true}\n```',
  ]) {
    assert.equal(webMcpTextLooksSensitive(text), false)
    assert.equal(redactWebMcpReport(text), text)
  }
})

test("repeated filtering preserves redacted diagnostic structure but never placeholder suffixes", () => {
  const safe = 'Completed\n{ "password": "[redacted]", "html": "<img>", "message": "safe" }'
  assert.equal(redactWebMcpReport(safe), safe)
  for (const unsafe of [
    'password="[redacted]secret"',
    'password="[redacted]"secret',
    'password="[redacted]", token="secret"',
    'password="<fill in>"; token=secret',
  ])
    assert.equal(redactWebMcpReport(unsafe), "[redacted]")
})

test("deep percent encodings fail closed without unbounded name decoding", () => {
  assert.equal(webMcpTextLooksSensitive(`https://example.test/#%${"25".repeat(100)}74oken=value`), true)
})

test("signed URL and OAuth shapes are redacted across display and report projections", () => {
  for (const [provider, url] of credentialUrlShapes) {
    assert.equal(webMcpTextLooksSensitive(url), true, provider)
    assert.equal(redactWebMcpReport({ downloadUrl: url }).downloadUrl, "[redacted]", provider)
  }
  const ordinary = "https://example.test/?sv=1&sp=r&se=2030&status=200"
  assert.equal(redactWebMcpReport(ordinary), ordinary)
})

test("short credential keys are filtered in structured reports", () => {
  for (const key of ["token", "sig", "password", "secret", "api_key", "Authorization"]) {
    for (const value of ["a", "abc123", 1]) {
      assert.deepEqual(redactWebMcpReport({ [key]: value }), { [key]: "[redacted]" })
    }
  }
})

test("display projections preserve the native 4096-character description limit", () => {
  const description = "x".repeat(4046) + " final builder instructions".padEnd(50, ".")
  assert.equal(description.length, 4096)
  assert.equal(webMcpDisplayDescription(description), description)
})

test("compound labels share sensitivity across object and schema boundaries", () => {
  for (const key of compoundKeys) {
    assert.equal(WEBMCP_SENSITIVE_NAME.test(key), true, key)
    assert.deepEqual(redactWebMcpReport({ [key]: secret }), { [key]: "[redacted]" })
    assert.equal(webMcpSchemaLooksSensitive({ properties: { [key]: { type: "string" } } }), true, key)
  }
})
