import { describe, expect, test } from "vitest"

import { parseGeneratedJsonResult } from "./generatedJsonResult"

describe("parseGeneratedJsonResult", () => {
  test("reads a reply that is exactly one fenced commit object", () => {
    const reply = ['```json', '{"subject":"Fix the parser","highlights":["One","Two","Three","Four"]}', "```"].join("\n")

    expect(parseGeneratedJsonResult(reply)).toMatchObject({
      kind: "commit",
      subject: "Fix the parser",
      highlights: ["One", "Two", "Three"],
    })
  })

  test("reads a reply that is exactly one bare object", () => {
    const reply = '{"title":"Add search","body":"Search the catalog."}\n'

    expect(parseGeneratedJsonResult(reply)).toMatchObject({
      kind: "pr",
      title: "Add search",
      body: "Search the catalog.",
    })
  })

  test("leaves prose that contains a fenced object to the markdown renderer", () => {
    // The reply was replaced by a commit card and this explanation never showed.
    const reply = [
      "Here is the commit I would write:",
      "```json",
      '{"subject":"Fix the parser"}',
      "```",
      "Tell me if you want a different wording.",
    ].join("\n")

    expect(parseGeneratedJsonResult(reply)).toBeNull()
  })

  test("leaves prose with a trailing object to the markdown renderer", () => {
    const reply = 'Use this payload: {"subject":"Fix the parser","highlights":[]}'

    expect(parseGeneratedJsonResult(reply)).toBeNull()
  })

  test("does not treat an object embedded between two fences as one result", () => {
    const reply = ['```json', '{"subject":"first"}', "```", "```json", '{"subject":"second"}', "```"].join("\n")

    expect(parseGeneratedJsonResult(reply)).toBeNull()
  })

  test("ignores a fenced block in another language", () => {
    const reply = ["```ts", '{"subject":"Not JSON mode"}', "```"].join("\n")

    expect(parseGeneratedJsonResult(reply)).toBeNull()
  })

  test("ignores malformed or non-object payloads", () => {
    expect(parseGeneratedJsonResult("{not json}")).toBeNull()
    expect(parseGeneratedJsonResult("```json\n[1,2,3]\n```")).toBeNull()
  })
})
