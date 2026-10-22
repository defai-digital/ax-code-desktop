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
  webMcpDisplayReport,
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
    assert.deepEqual(redactWebMcpReport(expected), expected)
    assert.deepEqual(webMcpDisplayReport(input), expected)
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


test("sensitive context crosses encoded containers and descendant declarations without leaking to siblings", () => {
  for (const fieldKey of ["name", "key", "field", "property", "path", "param", "parameter", "instancePath", "pointer"]) {
    const input = {
      error: {
        [fieldKey]: "api_key",
        details: JSON.stringify({ meta: [{ got: secret }] }),
        errors: [
          { [fieldKey]: "title", context: { got: "public" } },
          { context: { received: secret } },
          { [fieldKey]: "title", context: { [fieldKey]: "token", got: secret } },
        ],
      },
      sibling: { got: "public" },
    }
    const safe = redactWebMcpReport(input)
    assert.deepEqual(safe, {
      error: {
        [fieldKey]: "api_key",
        details: JSON.stringify({ meta: [{ got: "[redacted]" }] }),
        errors: [
          { [fieldKey]: "title", context: { got: "[redacted]" } },
          { context: { received: "[redacted]" } },
          { [fieldKey]: "title", context: { [fieldKey]: "token", got: "[redacted]" } },
        ],
      },
      sibling: { got: "public" },
    })
    assert.ok(JSON.stringify(input).includes(secret))
  }
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

test("descendant diagnostic declarations cannot clear inherited credential sensitivity", () => {
  for (const fieldKey of ["name", "key", "field", "property", "path", "param", "parameter", "instancePath", "pointer"]) {
    for (const declaration of ["", [], ["title"], "title", null]) {
      const input = { path: ["api_key"], issues: [{ [fieldKey]: declaration, received: secret }] }
      assert.equal(redactWebMcpReport(input).issues[0].received, "[redacted]")
    }
  }
})

test("diagnostic entry pairs retain inherited sensitive value context", () => {
  const input = { field: "api_key", details: [["received", secret], ["constraint", "minLength"]] }
  assert.deepEqual(redactWebMcpReport(input).details, [["received", "[redacted]"], ["constraint", "minLength"]])
})

test("diagnostic echoes cross encoded descendants while remaining local and idempotent", () => {
  for (const replacement of ["[redacted]", "<fill in>"]) {
    const input = {
      error: {
        field: "password",
        message: '"DEMO_PRIVATE_VALUE"',
        hint: "DEMO_PRIVATE_VALUE/1234/DEMO_PRIVATE_VALUE",
        details: JSON.stringify({ field: "title", received: "DEMO_PRIVATE_VALUE", hint: "(DEMO_PRIVATE_VALUE)" }),
        context: [["got", 1234], ["hint", "1234"]],
      },
      sibling: { message: "DEMO_PRIVATE_VALUE", got: 1234 },
    }
    const safe = redactWebMcpReport(input, replacement)
    assert.deepEqual(safe, {
      error: {
        field: "password",
        message: replacement,
        hint: replacement,
        details: JSON.stringify({ field: "title", received: replacement, hint: replacement }),
        context: [["got", replacement], ["hint", replacement]],
      },
      sibling: input.sibling,
    })
    assert.deepEqual(redactWebMcpReport(safe, replacement), safe)
    assert.deepEqual(JSON.parse(redactWebMcpReport(JSON.stringify(input), replacement)), safe)
  }
})

test("single-character echoes and replacement substrings never rewrite inserted placeholders", () => {
  for (const value of ["a", "red", "redacted", "$&", "\\", "\n"]) {
    for (const replacement of ["[redacted]", "<fill in>"]) {
      const input = { field: "pin", got: value, hint: `${value}${value}` }
      const expected = { field: "pin", got: replacement, hint: replacement }
      assert.deepEqual(redactWebMcpReport(input, replacement), expected)
      assert.deepEqual(redactWebMcpReport(expected, replacement), expected)
    }
  }
})


test("sensitive-key and shape-masked values filter echoes under every descendant key", () => {
  const secret = "AUDIT_DEMO_VALUE"
  const variants = [secret, secret.toLowerCase(), `  ${secret}  `,
    "%41UDIT%5FDEMO%5FVALUE", "\\u0041UDIT_DEMO_VALUE", "%2541UDIT_DEMO_VALUE"]
  for (const source of [{ password: secret }, [["password", secret]], { received: secret },
    { received: `  ${secret}  ` }, { password: "%41UDIT_DEMO_VALUE" },
    JSON.stringify({ password: secret })]) {
    for (const echo of variants) {
      const input = { error: { field: "password", details: source,
        arbitrary: `Rejected ${echo}`, nested: [{ other: `Rejected ${echo}` }],
        message: `Rejected ${echo}` }, sibling: { arbitrary: echo } }
      const safe = redactWebMcpReport(input)
      assert.equal(safe.error.arbitrary, "[redacted]")
      assert.equal(safe.error.nested[0].other, "[redacted]")
      assert.equal(safe.error.message, "[redacted]")
      assert.deepEqual(safe.sibling, input.sibling)
      assert.deepEqual(redactWebMcpReport(safe), safe)
    }
  }
  const shape = { field: "password", details: { arbitrary: "Bearer ShapeValue" }, echo: "Rejected bearer shapevalue" }
  assert.equal(redactWebMcpReport(shape).echo, "[redacted]")
})


test("echo normalization follows JSON control escapes and UTF-8 URL encoding", () => {
  for (const value of ["Line\nValue", "Tab\tValue", "Return\rValue", "Back\bValue", "Form\fValue", "Sëcret🔐"]) {
    for (const echo of [JSON.stringify(value).slice(1, -1), encodeURIComponent(value), encodeURIComponent(encodeURIComponent(value))]) {
      const safe = redactWebMcpReport({ field: "password", details: { password: value }, arbitrary: `Rejected ${echo}` })
      assert.equal(safe.arbitrary, "[redacted]")
    }
  }
})
