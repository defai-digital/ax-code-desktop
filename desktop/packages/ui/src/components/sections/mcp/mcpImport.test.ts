import { describe, expect, test } from "vitest"

import { applyImportedMcpToDraft, parseImportedMcpSnippet } from "./mcpImport"

describe("parseImportedMcpSnippet", () => {
  test("rejects arrays and primitives as top-level MCP snippets", () => {
    expect(parseImportedMcpSnippet("[]")).toEqual({
      ok: false,
      error: "Expected a JSON object, not an array or primitive",
    })
    expect(parseImportedMcpSnippet('"server"')).toEqual({
      ok: false,
      error: "Expected a JSON object, not an array or primitive",
    })
  })

  test("normalizes a single local MCP server entry", () => {
    expect(
      parseImportedMcpSnippet(
        JSON.stringify({
          mcpServers: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem"],
              env: { ROOT: "/tmp" },
              disabled: true,
            },
          },
        }),
      ),
    ).toEqual({
      ok: true,
      name: "filesystem",
      type: "local",
      command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
      url: "",
      environment: [{ key: "ROOT", value: "/tmp" }],
      headers: [],
      oauthEnabled: false,
      oauthClientId: "",
      oauthClientSecret: "",
      oauthScope: "",
      oauthRedirectUri: "",
      timeout: "",
      enabled: false,
    })
  })

  test("ignores array-shaped env and oauth payloads", () => {
    expect(
      parseImportedMcpSnippet(
        JSON.stringify({
          type: "remote",
          url: "https://example.com/mcp",
          env: [["TOKEN", "secret"]],
          oauth: [{ clientId: "ignored" }],
        }),
      ),
    ).toMatchObject({
      ok: true,
      type: "remote",
      url: "https://example.com/mcp",
      environment: [],
      oauthEnabled: false,
    })
  })
})

describe("applyImportedMcpToDraft", () => {
  test("normalizes an imported name for a new server", () => {
    // The typing rule the create form applies never ran for an imported name, so
    // `{"mcpServers":{"Roblox_Studio":…}}` reached the server's lowercase rule and failed with a
    // message the dialog collapsed into "Failed to save".
    const imported = parseImportedMcpSnippet(JSON.stringify({ mcpServers: { Roblox_Studio: { command: "run" } } }))
    if (!imported.ok) throw new Error("expected the snippet to parse")

    const draft = applyImportedMcpToDraft({ ...imported, name: "Roblox_Studio" }, {}, { isNewServer: true })

    expect(draft.name).toBe("roblox_studio")
  })

  test("keeps the draft's own name when an existing server is overwritten", () => {
    const imported = parseImportedMcpSnippet(JSON.stringify({ mcpServers: { other: { command: "run" } } }))
    if (!imported.ok) throw new Error("expected the snippet to parse")

    const draft = applyImportedMcpToDraft({ ...imported, name: "Other_Name" }, { name: "mine" })

    expect(draft.name).toBe("mine")
  })
})
