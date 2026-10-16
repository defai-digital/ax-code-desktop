import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// Neither editor can be mounted without the config stores and the runtime APIs, so their contracts are asserted
// against the source, as PlanView's and the GitHub board's are.
const readPage = (relativePath: string) => readFile(path.resolve(__dirname, relativePath), "utf8")

describe("config editors keep unsaved edits across a list reload", () => {
  test("the agents editor only re-populates when it switches to another agent", async () => {
    const source = await readPage("agents/AgentsPage.tsx")

    // The populate effect reads through `selectedAgent`, an object: deleting or creating another agent, or a
    // config-change event, gives it a new identity and re-populated the form over whatever was half-typed.
    expect(source).toContain("loadedAgentKeyRef")
    expect(source).toContain("if (loadedAgentKeyRef.current === populateKey)")
    expect(source).toContain("loadedAgentKeyRef.current = populateKey")
  })

  test("the commands editor only re-populates when it switches to another command", async () => {
    const source = await readPage("commands/CommandsPage.tsx")

    expect(source).toContain("loadedCommandKeyRef")
    expect(source).toContain("if (loadedCommandKeyRef.current === populateKey)")
    expect(source).toContain("loadedCommandKeyRef.current = populateKey")
  })

  test("both move the dirty baseline on save", async () => {
    // Skipping the re-population means the effect no longer refreshes the baseline after a save, so the save
    // path has to: otherwise the editor reports itself dirty for edits it just wrote.
    for (const page of ["agents/AgentsPage.tsx", "commands/CommandsPage.tsx"]) {
      const source = await readPage(page)
      expect(source).toContain("if (success && !isNew")
      expect(source).toContain("initialStateRef.current = {")
    }
  })

  test("both put the trimmed values in the form too, so the save clears the dirty flag", async () => {
    // Both baselines hold trimmed text while `isDirty` compares the raw state against them, so a prompt that ends
    // in a newline (or a description with trailing whitespace) left the editor dirty after a successful save —
    // the re-population used to correct it, and it no longer runs for the same key.
    const agents = await readPage("agents/AgentsPage.tsx")
    expect(agents).toContain(
      [
        "        setDescription(description.trim())",
        "        setModel(model.trim())",
        "        setPrompt(prompt.trim())",
      ].join("\n"),
    )

    const commands = await readPage("commands/CommandsPage.tsx")
    expect(commands).toContain(
      [
        "        setDescription(description.trim())",
        "        setAgent(trimmedAgent)",
        "        setModel(trimmedModel)",
        "        setTemplate(trimmedTemplate)",
      ].join("\n"),
    )
  })

  test("the agents editor clears a half-typed permission rule only when it re-populates", async () => {
    // The reset ran before the key guard, so the background reload of `agents` that the guard exists to ignore
    // also wiped the rule the user was in the middle of typing.
    const source = await readPage("agents/AgentsPage.tsx")

    const guardIndex = source.indexOf("if (loadedAgentKeyRef.current === populateKey)")
    expect(guardIndex).toBeGreaterThan(-1)
    // The reset belongs to the populate that the guard lets through: it must come after the guard and before the
    // form is filled.
    const resetIndex = source.indexOf('setPendingRulePattern("*")', guardIndex)
    const populateIndex = source.indexOf("setDescription(descriptionValue)", guardIndex)
    expect(resetIndex).toBeGreaterThan(guardIndex)
    expect(resetIndex).toBeLessThan(populateIndex)
  })
})
