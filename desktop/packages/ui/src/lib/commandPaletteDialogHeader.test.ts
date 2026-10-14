import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const sourcePath = (relativePath: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), relativePath)

// A DialogHeader left outside DialogContent mounts even while the dialog is
// closed, so its screen-reader-only title leaks into the DOM (and the
// accessibility tree) as a stray heading. Guard the nesting for the command
// palette and the shared command dialog.
const readComponent = (relativePath: string) => readFileSync(sourcePath(relativePath), "utf8")

const indexOfContent = (source: string) => source.indexOf("<DialogContent")
const indexOfHeader = (source: string) => source.indexOf('<DialogHeader className="sr-only">')

const headerIsInsideContent = (source: string) => {
  const content = indexOfContent(source)
  const header = indexOfHeader(source)
  if (content === -1 || header === -1) return false
  // The header must appear after the opening DialogContent tag.
  return header > content
}

describe("command palette dialog header nesting", () => {
  test("the sr-only DialogHeader sits inside DialogContent in CommandPalette", () => {
    const source = readComponent("../components/ui/CommandPalette.tsx")
    expect(indexOfContent(source)).toBeGreaterThan(-1)
    expect(indexOfHeader(source)).toBeGreaterThan(-1)
    expect(headerIsInsideContent(source)).toBe(true)
  })

  test("the sr-only DialogHeader sits inside DialogContent in the shared CommandDialog", () => {
    const source = readComponent("../components/ui/command.tsx")
    expect(indexOfContent(source)).toBeGreaterThan(-1)
    expect(indexOfHeader(source)).toBeGreaterThan(-1)
    expect(headerIsInsideContent(source)).toBe(true)
  })
})
