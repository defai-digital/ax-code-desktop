import { expect, test } from "vitest"
import { propertyDiff } from "./webMcpPropertyDiff"
import { WEBMCP_SENSITIVE_NAME, webMcpDisplaySchema } from "../../../../shared/webmcp-redaction.mjs"

const schema = (name: string, field: Record<string, unknown>) => ({ type: "object", properties: { [name]: field } })

test.each(["password", "account.password", "x".repeat(4000) + "password"])(
  "diffs preserve original sensitive property context: %.40s", (name) => {
    const before = schema(name, { type: "string", enum: ["synthetic-old-password"] })
    const after = schema(name, { type: "string", enum: ["synthetic-new-password"] })
    const diff = propertyDiff(before, after)
    expect(diff).toHaveLength(1)
    expect(diff[0]).toMatchObject({ fields: ["enum"], before: "[redacted]", after: "[redacted]" })
    expect(diff[0].property.length).toBeLessThanOrEqual(4000)
    expect(WEBMCP_SENSITIVE_NAME.test(diff[0].property)).toBe(true)
    expect(JSON.stringify(webMcpDisplaySchema(diff))).not.toContain("synthetic-")
    expect(before.properties[name].enum).toEqual(["synthetic-old-password"])
  },
)

test.each([
  ["minimum", 1, 2], ["maximum", 2, 3], ["minLength", 1, 2], ["maxLength", 2, 3],
  ["pattern", "^a", "^b"], ["format", "email", "uri"], ["default", "old", "new"],
] as const)("reports a change to %s alone", (keyword, before, after) => {
  expect(propertyDiff(schema("value", { [keyword]: before }), schema("value", { [keyword]: after })))
    .toEqual([expect.objectContaining({ property: "value", change: "changed", fields: [keyword] })])
})

test("defaults are redacted with original key, nested path and credential-text context", () => {
  for (const name of ["password", "auth.token"]) {
    const diff = propertyDiff(schema(name, { default: "old-secret" }), schema(name, { default: "new-secret" }))
    expect(diff[0]).toMatchObject({ fields: ["default"], before: "[redacted]", after: "[redacted]" })
  }
  const diff = propertyDiff(schema("value", { default: { credentials: { value: "old-secret" } } }),
    schema("value", { default: { credentials: { value: "new-secret" } } }))
  expect(JSON.stringify(diff)).not.toContain("-secret")
  expect(propertyDiff(schema("value", { default: "token=old-secret" }), schema("value", { default: "token=new-secret" }))[0])
    .toMatchObject({ before: { default: "[redacted]" }, after: { default: "[redacted]" } })
})

test("added and removed sensitive properties never expose their values", () => {
  for (const [before, after] of [[{}, schema("password", { default: "synthetic-password" })],
    [schema("password", { default: "synthetic-password" }), {}]]) {
    expect(propertyDiff(before, after)).toHaveLength(1)
    expect(JSON.stringify(propertyDiff(before, after))).not.toContain("synthetic-password")
  }
})
