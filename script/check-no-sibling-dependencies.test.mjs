import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "..")
const scriptSource = path.join(repositoryRoot, "script/check-no-sibling-dependencies.mjs")
const sdkSpecifier = "jsr:@defai-digital/ax-code-sdk@1.0.0"
const temporaryRoots = []

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "no-sibling-dependencies-"))
  temporaryRoots.push(root)
  fs.mkdirSync(path.join(root, "script"), { recursive: true })
  fs.copyFileSync(scriptSource, path.join(root, "script/check-no-sibling-dependencies.mjs"))
  fs.mkdirSync(path.join(root, "config"), { recursive: true })
  fs.writeFileSync(path.join(root, "config/ax-code-sdk.json"), JSON.stringify({ specifier: sdkSpecifier }))
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "ax-coder", dependencies: { "@defai-digital/ax-code-sdk": sdkSpecifier } }),
  )
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - desktop/packages/*\n")
  fs.writeFileSync(path.join(root, "turbo.json"), "{}\n")
  for (const file of ["desktop/vite-theme-plugin.ts", "desktop/vitest.config.ts"]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), "export {}\n")
  }
  for (const packageName of ["ui", "web"]) {
    const directory = path.join(root, "desktop/packages", packageName)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ dependencies: { "@defai-digital/ax-code-sdk": sdkSpecifier } }),
    )
  }
  fs.mkdirSync(path.join(root, "desktop/scripts"), { recursive: true })
  fs.mkdirSync(path.join(root, "desktop/docs"), { recursive: true })
  return root
}

function writeSource(root, relativePath, source) {
  const file = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source)
}

function runGate(root) {
  try {
    const output = execFileSync("node", [path.join(root, "script/check-no-sibling-dependencies.mjs")], {
      encoding: "utf8",
    })
    return { status: 0, output }
  } catch (error) {
    return { status: error.status, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true })
  }
})

describe("AX Code sibling dependency check", () => {
  it("passes a tree that only consumes the exact SDK pin", () => {
    expect(runGate(createRoot())).toEqual(
      expect.objectContaining({ status: 0, output: expect.stringContaining("check passed") }),
    )
  })

  it("scans explicit direct files regardless of extension", () => {
    const root = createRoot()
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - desktop/packages/*\n  - "../ax-code/packages/*"\n',
    )

    const result = runGate(root)
    expect(result.status).toBe(1)
    expect(result.output).toContain("pnpm-workspace.yaml")
    expect(result.output).toContain("AX Code sibling path")
  })

  it("detects dynamic imports and require calls of private runtime modules", () => {
    const root = createRoot()
    writeSource(
      root,
      "desktop/packages/web/src/dynamic.ts",
      'const session = await import("ax-code/session", { with: { type: "json" } })\n',
    )
    writeSource(root, "desktop/packages/web/src/common.cjs", 'const tool = require("ax-code/tool/private")\n')

    const result = runGate(root)
    expect(result.status).toBe(1)
    expect(result.output.match(/private AX Code runtime import/g)).toHaveLength(2)
  })

  it("ignores comments and string contents that mention private runtime imports", () => {
    const root = createRoot()
    writeSource(
      root,
      "desktop/packages/web/src/text.ts",
      [
        '// note: from "ax-code/session"',
        '/* import x from "ax-code/provider" */',
        'const example = \'from "ax-code/session"\'',
        'const other = `require("ax-code/tool")`',
      ].join("\n"),
    )

    expect(runGate(root).status).toBe(0)
  })

  it("still detects static from imports", () => {
    const root = createRoot()
    writeSource(root, "desktop/packages/web/src/static.ts", 'import session from "ax-code/session"\n')

    const result = runGate(root)
    expect(result.status).toBe(1)
    expect(result.output).toContain("private AX Code runtime import")
  })

  it("scans .cts sources", () => {
    const root = createRoot()
    writeSource(root, "desktop/packages/web/src/legacy.cts", 'import session from "ax-code/session"\n')

    const result = runGate(root)
    expect(result.status).toBe(1)
    expect(result.output).toContain("legacy.cts")
  })
})
