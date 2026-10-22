import assert from "node:assert/strict"
import { test } from "node:test"
import { performance } from "node:perf_hooks"
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

test("64 KiB prose and whitespace redact within a generous main-thread budget", () => {
  for (const text of ["a ".repeat(32768), " ".repeat(65536)]) {
    assert.equal(Buffer.byteLength(text), 65536)
    const start = performance.now()
    assert.equal(redactWebMcpReport(text), text)
    const elapsed = performance.now() - start
    assert.ok(elapsed < 500, `64 KiB redaction took ${elapsed.toFixed(1)} ms (budget: 500 ms)`)
  }
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

test("entry pairs carry sensitive names to their values across encoded and nested reports", () => {
  for (const entry of [["x-api-key", secret], { name: "Authorization", value: secret }, { key: "session-token", value: secret }]) {
    for (const value of [entry, { headers: [entry] }, JSON.stringify({ headers: [entry] })]) {
      assert.ok(!JSON.stringify(redactWebMcpReport(value)).includes(secret))
      assert.ok(!JSON.stringify(redactWebMcpReport(value, "<fill in>")).includes(secret))
    }
  }
  assert.deepEqual(redactWebMcpReport([["Accept", "application/json"]]), [["Accept", "application/json"]])
})

test("field-naming keys redact sibling rejected values at any depth and in JSON strings", async () => {
  const { fieldContextCases } = await import("./testing/webmcp-redaction-cases.mjs")
  for (const { input, expected } of fieldContextCases) {
    assert.deepEqual(redactWebMcpReport(input), expected)
    assert.deepEqual(redactWebMcpReport({ error: { errors: [input] } }), { error: { errors: [expected] } })
    assert.deepEqual(JSON.parse(redactWebMcpReport(JSON.stringify({ error: input }))), { error: expected })
  }
  for (const path of ["/items/0/title", "account.profile.title", ["items", 0, "title"], [0, 1]]) {
    const input = { path, got: "public", constraint: "minLength" }
    assert.deepEqual(redactWebMcpReport(input), input)
  }
  assert.deepEqual(redactWebMcpReport({ error: { field: "password", constraint: "minLength", got: secret } }),
    { error: { field: "password", constraint: "minLength", got: "[redacted]" } })
})

test("input consumers learn about depth, cycle, traversal and redacted-key collision bounds", () => {
  let deep = { last: 1 }
  for (let index = 0; index < 40; index++) deep = { nested: deep }
  const cycle = {}; cycle.self = cycle
  for (const input of [deep, cycle, { nodes: Array(100001).fill(0) }, { "password=one": 1, "token=two": 2 }]) {
    let truncated = false
    redactWebMcpReport(input, "[redacted]", { onTruncate: () => { truncated = true } })
    assert.equal(truncated, true)
  }
  let truncated = false
  redactWebMcpReport({ error: { field: "password", got: secret } }, "[redacted]", { onTruncate: () => { truncated = true } })
  assert.equal(truncated, false)
})

test("compound literal field names keep their existing sensitivity", () => {
  for (const key of ["name", "key", "field", "property", "param", "parameter"]) {
    for (const name of ["api.key", "private.key", "client.secret", "sig"]) {
      assert.deepEqual(redactWebMcpReport({ [key]: name, got: secret }), { [key]: name, got: "[redacted]" })
    }
  }
})

test("array element diagnostics inherit sensitive ancestor context", () => {
  for (const path of [["passwords", 0], ["api.key", 0, 1], "/passwords/0", "passwords[0]", "/api.key/0/1", ["passwords", 0, "title"], "/passwords/0/title", "passwords[0].title", 'auth["api.key"]', 'auth["private.key"]']) {
    assert.deepEqual(redactWebMcpReport({ path, received: secret }), { path, received: "[redacted]" })
  }
  for (const path of [["titles", 0], "/account/title", "account.title"]) {
    const input = { path, received: "public" }
    assert.deepEqual(redactWebMcpReport(input), input)
  }
})

test("long plain prose and whitespace do not trigger repeated assignment rescanning", () => {
  const started = performance.now()
  for (const text of ["ab ".repeat(22000), " ".repeat(66000), "ab-".repeat(22000), "a.".repeat(33000)]) {
    assert.equal(webMcpTextLooksSensitive(text), false)
    assert.equal(webMcpTextLooksSensitive(`${text}api key=private-value`), true)
  }
  assert.ok(performance.now() - started < 1000, "Credential scanning must remain bounded for long prose")
})

test("bracketed textual assignment paths retain sensitive compound names and indexes", () => {
  for (const name of ['auth["api.key"]', "auth['private.key'][0]", "auth[api_key][0]", "auth[`sig`][0]"]) {
    for (const separator of ["=", " = ", ": "]) {
      const text = `${name}${separator}${secret}`
      assert.equal(redactWebMcpReport({ error: text }).error, "[redacted]", text)
    }
  }
  assert.equal(redactWebMcpReport('auth["title"][0] = public'), 'auth["title"][0] = public')
})

test("sensitive diagnostic context survives nested containers and JSON strings", () => {
  for (const details of [{ got: secret }, [{ received: secret }], { nested: { actual: secret } }, JSON.stringify({ got: secret })]) {
    const input = { error: { field: "api_key", constraint: "minLength", details } }
    for (const value of [input, JSON.stringify(input), { envelope: [input] }]) {
      assert.ok(!JSON.stringify(redactWebMcpReport(value)).includes(secret))
    }
    assert.equal(redactWebMcpReport(input).error.constraint, "minLength")
  }
  const ordinary = { field: "title", details: { got: "public" } }
  assert.deepEqual(redactWebMcpReport(ordinary), ordinary)
})
