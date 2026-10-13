import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, describe, expect, it } from "vitest"

import { bumpVersions } from "./bump-version.mjs"

const created = []
const MANIFEST_PATHS = [
  "package.json",
  "desktop/packages/ui/package.json",
  "desktop/packages/web/package.json",
  "desktop/packages/electron/package.json",
]

const writeManifest = (repo, relativePath, version) => {
  const fullPath = path.join(repo, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, `${JSON.stringify({ name: "ax-coder", version }, null, 2)}\n`)
}

const readVersion = (repo, relativePath) => JSON.parse(fs.readFileSync(path.join(repo, relativePath), "utf8")).version

// Mirrors the repository layout: the workspace root manifest sits beside `desktop/`.
const makeRepo = ({ withRootManifest = true } = {}) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-bump-version-"))
  created.push(repo)
  if (withRootManifest) writeManifest(repo, "package.json", "1.0.0")
  for (const name of ["ui", "web", "electron"]) writeManifest(repo, `desktop/packages/${name}/package.json`, "1.0.0")
  return repo
}

afterEach(() => {
  while (created.length > 0) fs.rmSync(created.pop(), { recursive: true, force: true })
})

describe("bump-version", () => {
  it("bumps the workspace root as well as the three package manifests", () => {
    const repo = makeRepo()

    const updated = bumpVersions("2.5.0", path.join(repo, "desktop"))

    expect(updated.map((entry) => entry.path)).toEqual([
      "../package.json",
      "packages/ui/package.json",
      "packages/web/package.json",
      "packages/electron/package.json",
    ])
    for (const manifestPath of MANIFEST_PATHS) {
      expect(readVersion(repo, manifestPath)).toBe("2.5.0")
    }
  })

  it("keeps the release contract satisfied", () => {
    const repo = makeRepo()

    bumpVersions("3.0.0-beta.1", path.join(repo, "desktop"))

    // The contract refuses a version set that disagrees, so every manifest must move together.
    const versions = MANIFEST_PATHS.map((manifestPath) => readVersion(repo, manifestPath))
    expect(new Set(versions).size).toBe(1)
  })

  it("skips a manifest that is not present", () => {
    const repo = makeRepo({ withRootManifest: false })

    const updated = bumpVersions("4.0.0", path.join(repo, "desktop"))

    expect(updated.map((entry) => entry.path)).not.toContain("../package.json")
    expect(fs.existsSync(path.join(repo, "package.json"))).toBe(false)
    expect(readVersion(repo, "desktop/packages/electron/package.json")).toBe("4.0.0")
  })
})
