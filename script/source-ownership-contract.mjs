import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readReleasePolicy } from "./release-policy.mjs"

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const requiredTrackedPaths = [
  "desktop/packages/electron/package.json",
  "desktop/packages/ui/package.json",
  "desktop/packages/web/package.json",
  "desktop/NOTICE",
  "desktop/LICENSE-MIT",
  ".github/workflows/desktop-ci.yml",
  ".github/workflows/desktop-shadow.yml",
  "config/desktop-identity.json",
  "config/desktop-release-policy.json",
]

function parseJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

export function workspaceDeclaresDesktopPackages(workspace) {
  const withoutComments = workspace
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
    .join("\n")
  return withoutComments.includes("desktop/packages/*")
}

export function sourceOwnershipViolations(root = repositoryRoot) {
  const violations = []
  const tracked = new Set(
    execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean),
  )

  for (const relative of requiredTrackedPaths) {
    if (!tracked.has(relative) || !fs.existsSync(path.join(root, relative))) {
      violations.push(`required owned path is missing or untracked: ${relative}`)
    }
  }

  if (tracked.has(".github/workflows/desktop-release.yml")) {
    violations.push("public Desktop release workflow must remain absent before release cutover")
  }

  const rootManifest = parseJson(path.join(root, "package.json"))
  if (rootManifest.name !== "ax-coder") violations.push("root package must be ax-coder")
  for (const script of ["dev", "build", "typecheck", "lint", "test", "package:desktop"]) {
    if (typeof rootManifest.scripts?.[script] !== "string")
      violations.push(`required root script is missing: ${script}`)
  }

  const workspace = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8")
  if (!workspaceDeclaresDesktopPackages(workspace)) {
    violations.push("Desktop packages must be in the pnpm workspace")
  }

  try {
    readReleasePolicy(root)
  } catch (error) {
    violations.push(error.message)
  }

  const desktopFiles = [...tracked].filter((file) => file.startsWith("desktop/"))
  if (desktopFiles.length === 0) violations.push("AX Code Desktop must track the Desktop source tree")

  return { desktopFileCount: desktopFiles.length, violations }
}

export function assertSourceOwnership(root = repositoryRoot) {
  const result = sourceOwnershipViolations(root)
  if (result.violations.length > 0) {
    throw new Error(`AX Code Desktop source ownership contract failed:\n- ${result.violations.join("\n- ")}`)
  }
  return result
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const result = assertSourceOwnership()
    console.log(`AX Code Desktop source ownership contract passed (${result.desktopFileCount} Desktop files).`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
