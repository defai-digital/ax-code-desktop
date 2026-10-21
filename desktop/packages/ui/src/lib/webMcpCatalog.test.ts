import { nativeWebMcpTool } from "@/test/webMcpCatalog"
import { expect, test } from "vitest"
import {
  diffWebMcpRegistration,
  markWebMcpRunsStale,
  webMcpToolIdentity,
  readWebMcpCatalog,
  readWebMcpRejection,
  WEBMCP_CATALOG_BYTE_CAP,
  WEBMCP_CATALOG_TOOL_CAP,
  WEBMCP_REGISTRATION_LIMIT,
  type WebMcpToolDefinition,
} from "./webMcpCatalog"

const tool = (name: string, description = "Describe the tool", extra: Partial<WebMcpToolDefinition> = {}) => nativeWebMcpTool({
  name,
  description,
  ...extra,
})

test("shows 64 of N and stops before a definition that crosses 256 KiB", () => {
  expect(WEBMCP_CATALOG_TOOL_CAP).toBe(64)
  expect(WEBMCP_CATALOG_BYTE_CAP).toBe(262144)
  const many = Array.from({ length: 65 }, (_, index) => tool(`tool_${index}`, "Short"))
  const counted = readWebMcpCatalog(many)
  expect(counted.catalog).toHaveLength(64)
  expect(counted.catalogLimit).toEqual({ total: 65, shown: 64, truncation: "count" })
  expect(counted.catalog.map((entry) => entry.name)).not.toContain("tool_64")

  const trusted = readWebMcpCatalog(counted.catalog, { total: 70, truncation: "count" })
  expect(trusted.catalogLimit).toEqual({ total: 70, shown: 64, truncation: "count" })
  expect(trusted.catalog[0]?.digest).toBe(counted.catalog[0]?.digest)

  const sized = readWebMcpCatalog([
    tool("first", "d", { inputSchema: { type: "object" } }),
    tool("second", "d", { inputSchema: { pad: "x".repeat(262144) } }),
  ])
  expect(sized.catalog.map((entry) => entry.name)).toEqual(["first"])
  expect(sized.catalogLimit).toEqual({ total: 2, shown: 1, truncation: "bytes" })
})

test("keeps form tools and exact-true hints, and names only known rejection reasons", () => {
  const read = readWebMcpCatalog([
    {
      name: "save",
      description: "Save",
      kind: "form",
      annotations: { readOnly: true, untrustedContentHint: "yes", consequential: 1 },
    },
    { name: "run", description: "Run", annotations: { consequentialHint: true } },
  ])
  expect(read.catalog[0]).toMatchObject({
    kind: "form",
    annotations: { readOnlyHint: true, untrustedContentHint: false, consequentialHint: false },
  })
  expect(read.catalog[1]?.annotations).toMatchObject({ consequentialHint: true, readOnlyHint: false })
  expect(read.catalog[1]?.kind).toBe("script")
  expect(readWebMcpRejection({ code: "invalid-catalog", reason: "duplicate-name", tool: "n".repeat(80) })).toEqual({
    code: "invalid-catalog",
    reason: "duplicate-name",
    tool: "n".repeat(64),
  })
  expect(readWebMcpRejection({ code: "invalid-catalog", reason: "nope", tool: "x" })).toBeNull()
  expect(readWebMcpCatalog([], { rejection: { code: "nope" } }).catalogRejection).toBeNull()
})

test("a same-definition reload is not a registration change, and a different digest is", () => {
  const echo = readWebMcpCatalog([tool("echo")]).catalog
  const added = diffWebMcpRegistration([], echo, [])
  expect(added).toEqual([{ invocationID: echo[0].invocationID, kind: "added", name: "echo", digest: echo[0]?.digest, definition: echo[0], previousDefinition: undefined }])
  const again = diffWebMcpRegistration(echo, readWebMcpCatalog([tool("echo")]).catalog, added)
  expect(again).toBe(added)
  const removed = diffWebMcpRegistration(echo, [], added)
  expect(removed.map((event) => event.kind)).toEqual(["added", "removed"])
  const reloaded = diffWebMcpRegistration([], echo, removed)
  expect(reloaded).toEqual(added)
  const revised = readWebMcpCatalog([tool("echo", "Revised")]).catalog
  const changed = diffWebMcpRegistration(echo, revised, added)
  expect(changed[1]).toEqual({
    invocationID: echo[0].invocationID,
    kind: "changed",
    name: "echo",
    digest: revised[0]?.digest,
    previousDigest: echo[0]?.digest,
    definition: revised[0],
    previousDefinition: echo[0],
  })
  const burst = readWebMcpCatalog(Array.from({ length: 40 }, (_, index) => tool(`tool_${index}`))).catalog
  const events = diffWebMcpRegistration([], burst, [])
  expect(events).toHaveLength(WEBMCP_REGISTRATION_LIMIT)
  expect(events[0]?.name).toBe("tool_8")
  expect(events.at(-1)?.name).toBe("tool_39")
})

test("marks removed and changed native run identities stale without matching display labels", () => {
  const echo = nativeWebMcpTool(tool("[redacted]"), "frame-1")
  const identity = webMcpToolIdentity(echo)!
  const runs = { [identity]: { digest: echo.digest!, stale: false, text: "5" } }
  expect(markWebMcpRunsStale(runs, [echo])).toBe(runs)
  for (const catalog of [[], [nativeWebMcpTool(tool("[redacted]", "Revised"), "frame-1")], [nativeWebMcpTool(tool("[redacted]"), "frame-2")]]) {
    const revised = markWebMcpRunsStale(runs, catalog)
    expect(revised[identity]).toEqual({ ...runs[identity], stale: true })
    expect(markWebMcpRunsStale(revised, [echo])[identity].stale).toBe(false)
  }
  // A matching display label is never a substitute for a native identity.
  expect(markWebMcpRunsStale({ "[redacted]": runs[identity] }, [echo])["[redacted]"].stale).toBe(true)
})


test("preserves native definition identity separately from the frame-independent catalog digest", () => {
  const original = nativeWebMcpTool(tool("echo"), "frame-1")
  const reloaded = nativeWebMcpTool(tool("echo"), "frame-2")
  const before = readWebMcpCatalog([original]).catalog
  const after = readWebMcpCatalog([reloaded]).catalog
  expect(before[0].definitionDigest).toBe(original.definitionDigest)
  expect(after[0].definitionDigest).toBe(reloaded.definitionDigest)
  expect(after[0].definitionDigest).not.toBe(before[0].definitionDigest)
  expect(after[0].digest).toBe(before[0].digest)
  expect(diffWebMcpRegistration(before, after, [])).toEqual([expect.objectContaining({ kind: "changed", previousDefinition: before[0], definition: after[0] })])
  expect(readWebMcpCatalog([{ name: "echo", description: "Echo" }]).catalog[0].definitionDigest).toBeUndefined()
})

test("catalog rejects oversized descriptions and redacts rejection labels before truncation", () => {
  const secret = "ghp_" + "k".repeat(36)
  const result = readWebMcpCatalog([{ name: "echo", description: "x".repeat(4085) + " " + secret }], {
    rejection: { code: "invalid-catalog", reason: "invalid-name", tool: "x".repeat(55) + " " + secret },
  })
  expect(result.catalog).toEqual([])
  expect(result.catalogRejection?.tool).toBe("[redacted]")
})

test("two credential-shaped tools keep separate registration definitions and reveal the second schema edit", async () => {
  const { credentialToolFixture } = await import("@/test/webMcpCatalog")
  const { propertyDiff } = await import("./webMcpPropertyDiff")
  const fixture = credentialToolFixture()
  const before = fixture.project()
  expect(before.map((tool) => tool.name)).toEqual(["[redacted tool 1]", "[redacted tool 2]"])
  const added = diffWebMcpRegistration([], before, [])
  expect(added).toHaveLength(2)
  for (const [index, event] of added.entries()) {
    expect(event.definition).toBe(before[index])
    expect(event.digest).toBe(event.definition?.digest)
  }
  const after = fixture.project(true, true)
  expect(after.map((tool) => tool.name)).toEqual(["[redacted tool 2]", "[redacted tool 1]"])
  expect(after[0].invocationID).toBe(before[1].invocationID)
  const events = diffWebMcpRegistration(before, after, added)
  expect(events).toHaveLength(3)
  const changed = events[2]
  expect(changed).toMatchObject({ kind: "changed", invocationID: before[1].invocationID,
    previousDefinition: before[1], definition: after[0] })
  const diff = propertyDiff(changed.previousDefinition?.executionSchema, changed.definition?.executionSchema)
  expect(JSON.stringify(diff)).toContain("boolean")
  expect(JSON.stringify(diff)).toContain("required")
  const identity = webMcpToolIdentity(before[1])!
  expect(markWebMcpRunsStale({ [identity]: { digest: before[1].digest!, stale: false } }, after)[identity].stale).toBe(true)
  expect(JSON.stringify(events)).not.toMatch(/ghp_/)
})

test("registration never merges missing identities or colliding display labels", () => {
  expect(diffWebMcpRegistration([], [{ name: "[redacted]", description: "Unknown" }], [])).toEqual([])
  const first = nativeWebMcpTool({ name: "one", description: "One" })
  const second = nativeWebMcpTool({ name: "two", description: "Two" })
  expect(diffWebMcpRegistration([], [first, second].map((tool) => ({ ...tool, name: "[redacted]" })), [])).toHaveLength(2)
})
