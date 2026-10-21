import { expect, test } from "vitest"
import { lintWebMcpTool, WEBMCP_REJECTED_SCHEMA_KEYWORDS } from "./webMcpToolLint"

const tool = (inputSchema: unknown, name = "search", description = "Search the catalog") =>
  lintWebMcpTool({ name, description, inputSchema })

test("rejected schema keywords are advice and property names are not keywords", () => {
  // Mutation probe: dropping either keyword from the exported list fails this test,
  // and treating a property name or format as a keyword fails the negative expects.
  expect([...WEBMCP_REJECTED_SCHEMA_KEYWORDS]).toEqual(["pattern", "patternProperties"])
  expect(
    tool({ type: "object", properties: { q: { type: "string", description: "Query", pattern: "^a" } } }),
  ).toContainEqual({ code: "rejected-keyword", keyword: "pattern" })
  expect(
    tool({
      type: "object",
      properties: { q: { type: "string", description: "Query" } },
      patternProperties: { "^a": { type: "string" } },
    }),
  ).toContainEqual({ code: "rejected-keyword", keyword: "patternProperties" })
  expect(
    tool({ type: "array", items: { type: "string", pattern: "^a" } }).some((finding) => finding.keyword === "pattern"),
  ).toBe(true)
  expect(
    tool({ type: "object", properties: { pattern: { type: "string", description: "A label" } } }).some(
      (finding) => finding.code === "rejected-keyword",
    ),
  ).toBe(false)
  expect(
    tool({
      type: "object",
      properties: { email: { type: "string", description: "Email", format: "email" } },
    }).some((finding) => finding.code === "rejected-keyword"),
  ).toBe(false)
})

test("advises on name length, description length, missing descriptions, and opaque values", () => {
  expect(tool({ type: "object" }, "n".repeat(64), "d".repeat(500))).toEqual([])
  expect(tool({ type: "object" }, "n".repeat(65), "d")).toContainEqual({ code: "name-length", length: 65 })
  expect(tool({ type: "object" }, "search", "d".repeat(501))).toContainEqual({
    code: "description-length",
    length: 501,
  })
  expect(tool({ type: "object" }, "search", "   ")).toContainEqual({ code: "missing-description" })
  const findings = tool({
    type: "object",
    properties: {
      title: { type: "string", description: "Title" },
      code: { type: "string", enum: ["IN_PROGRESS", "a", "b", "1111222233334444", 5], const: true },
    },
  })
  expect(findings).toContainEqual({ code: "missing-property-description", names: "code" })
  const opaque = findings.find((finding) => finding.code === "opaque-value")
  expect(opaque?.names).toContain("code=1111222233334444")
  expect(opaque?.names).toContain("code=5")
  expect(opaque?.names).toContain("code=true")
  expect(opaque?.names).not.toContain("IN_PROGRESS")
  expect(opaque?.names).not.toContain("code=a")
  expect(tool({ type: "object", properties: { title: { type: "string", description: "Title" } } })).toEqual([])
})

test("a cyclic schema does not throw", () => {
  const schema: Record<string, unknown> = { type: "object", properties: {} }
  schema.properties = { again: schema }
  expect(() => tool(schema)).not.toThrow()
})
