import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

import { rankSlashQuery, type SlashQueryItem } from "./slashQuery"

describe("slash query", () => {
  test("returns commands, snippets, and magic prompts with an exact command first", () => {
    const items: SlashQueryItem[] = [
      { source: "snippet", id: "snippet", name: "review notes", description: "saved review", payload: null },
      { source: "magic-prompt", id: "magic", name: "Review the diff", description: "workspace review", payload: null },
      { source: "command", id: "command", name: "review", description: "review command", payload: null },
      { source: "command", id: "other", name: "plan", description: "planning", payload: null },
    ]

    const ranked = rankSlashQuery("review", items)
    expect(ranked.map((item) => item.source)).toEqual(["command", "snippet", "magic-prompt"])
    expect(ranked[0]?.id).toBe("command")
    expect(new Set(ranked.map((item) => item.source))).toEqual(new Set(["command", "snippet", "magic-prompt"]))
  })

  test("the slash autocomplete ranks commands and skills only", () => {
    const source = readFileSync(sourcePath("../components/chat/CommandAutocomplete.tsx"), "utf8")
    expect(source).toContain("rankSlashQuery")
    expect(source).not.toContain("listSearchableMagicPrompts")
    expect(source).not.toContain('source: "snippet"')
  })
})
