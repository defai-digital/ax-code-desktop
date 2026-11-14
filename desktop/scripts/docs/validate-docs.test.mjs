import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { validateDocs } from "./validate-docs.mjs"

const directories = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createWorkspace(pages, links) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ax-code-docs-"))
  directories.push(root)
  const files = {
    "README.md": "# AX Code Desktop\n",
    "desktop/README.md": "# Workspace\n",
    "desktop/packages/web/README.md": "# Local server\n",
    "desktop/packages/docs/sidebar.config.json": JSON.stringify({
      sections: [{ items: links.map((link) => ({ link })) }],
    }),
    ...Object.fromEntries(
      Object.entries(pages).map(([name, content]) => [`desktop/packages/docs/content/docs/${name}`, content]),
    ),
  }
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return root
}

const page = "---\ntitle: Getting started\ndescription: Start using AX Code Desktop.\n---\n\n# Getting started\n"

describe("documentation validation", () => {
  it("resolves root, nested index and ordinary page routes", async () => {
    const root = await createWorkspace({ "index.mdx": page, "guides/index.mdx": page, "guides/install.mdx": page }, [
      "/",
      "/guides/",
      "/guides/install/",
    ])
    expect(await validateDocs(root)).toEqual({ errors: [], pageCount: 3, linkCount: 3 })
  })

  it("reports missing frontmatter and sidebar targets together", async () => {
    const root = await createWorkspace({ "index.mdx": "# Missing metadata\n" }, ["/", "/missing/"])
    const result = await validateDocs(root)
    expect(result.errors).toEqual([
      "desktop/packages/docs/content/docs/index.mdx: missing frontmatter key 'title'",
      "desktop/packages/docs/content/docs/index.mdx: missing frontmatter key 'description'",
      "sidebar link has no page: /missing/",
    ])
  })

  it("rejects unsupported update instructions in pages and readmes", async () => {
    const root = await createWorkspace({ "index.mdx": `${page}\nRun ax-code-desktop update.\n` }, ["/"])
    await writeFile(path.join(root, "README.md"), "Run ax-code-desktop update.\n")
    const result = await validateDocs(root)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain("desktop/packages/docs/content/docs/index.mdx:")
    expect(result.errors[1]).toContain("README.md:")
    expect(result.errors.every((error) => error.includes("supported Desktop user update command"))).toBe(true)
  })

  it("fails on unreadable navigation instead of accepting an unchecked tree", async () => {
    const root = await createWorkspace({ "index.mdx": page }, ["/"])
    await writeFile(path.join(root, "desktop/packages/docs/sidebar.config.json"), "invalid JSON")
    await expect(validateDocs(root)).rejects.toThrow()
  })
})
