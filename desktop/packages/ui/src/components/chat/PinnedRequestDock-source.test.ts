import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

const chatContainerPath = path.resolve(__dirname, "ChatContainer.tsx")
const dockPath = path.resolve(__dirname, "PinnedRequestDock.tsx")

describe("PinnedRequestDock source guards", () => {
  test("dock renders questions then permissions with stable keys in a bounded scroll area", async () => {
    const source = await readFile(dockPath, "utf8")

    expect(source).toContain("data-pinned-requests")
    expect(source).toContain("max-h-[45vh] shrink-0 overflow-y-auto")
    expect(source).toContain("<QuestionCard key={question.id} question={question} />")
    expect(source).toContain("<PermissionCard key={permission.id} permission={permission} />")
    expect(source.indexOf("sessionQuestions.map")).toBeLessThan(source.indexOf("sessionPermissions.map"))
    expect(source).toContain("if (sessionQuestions.length === 0 && sessionPermissions.length === 0)")
  })

  test("every session composer branch renders one dock, including expanded input", async () => {
    const source = await readFile(chatContainerPath, "utf8")

    expect(source).toContain('import { PinnedRequestDock } from "./PinnedRequestDock"')
    // Hydrating, empty, and main transcript branches.
    expect(source.match(/<PinnedRequestDock sessionQuestions=\{sessionQuestions\}/g)).toHaveLength(3)
    // The dock must not be skipped for the expanded composer.
    expect(source).not.toContain("!isDesktopExpandedInput && (sessionQuestions.length > 0")
    expect(source).not.toContain("!isDesktopExpandedInput && (sessionPermissions.length > 0")
  })
})
