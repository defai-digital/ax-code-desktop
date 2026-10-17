import { execFileSync } from "node:child_process"
import { appendFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const FULL_SCOPE = { verify: true, build: true, native: true, packaged: true }

function isDocumentation(file) {
  // Markdown inside application source/assets can be bundled product content.
  if (/^desktop\/packages\/(ui|web|electron)\/(src|public|resources)\//.test(file)) return false
  return /\.(md|mdx)$/.test(file) || [".gitignore", "LICENSE", "NOTICE"].includes(file)
}

function isUnitTest(file) {
  // These verifiers also execute on Windows in the native matrix.
  if (/^script\/(desktop-windows-bootstrap|windows-minisign-acl)\.test\.mjs$/.test(file)) return false
  if (file.startsWith("desktop/packages/electron/scripts/")) return false
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /\/(?:__tests__|tests?)\//.test(file)
}

function isRenderer(file) {
  return (
    /^(desktop\/packages\/ui\/src\/|desktop\/packages\/web\/(src|public)\/)/.test(file) ||
    /^desktop\/packages\/web\/[^/]+\.html$/.test(file)
  )
}

export function classifyChanges(files) {
  const code = files.filter((file) => !isDocumentation(file))
  const application = code.filter((file) => !isUnitTest(file))
  return {
    verify: code.length > 0,
    build: application.length > 0,
    native: application.some((file) => !isRenderer(file)),
    packaged: application.length > 0,
  }
}

export function resolveScope({ event, base, head, cwd = process.cwd(), git = execFileSync }) {
  // Unknown events, missing history, and initial pushes must run all checks.
  if (!["push", "pull_request"].includes(event)) return { ...FULL_SCOPE }
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? "") && !/^0+$/.test(sha))) {
    return { ...FULL_SCOPE }
  }
  const run = (args) => git("git", args, { cwd, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] })
  try {
    try {
      run(["cat-file", "-e", `${base}^{commit}`])
    } catch {
      run(["fetch", "--no-tags", "--depth=1", "origin", base])
    }
    // Include both names of a rename so moving native code to a renderer path
    // cannot suppress the native matrix. NUL separators preserve odd filenames.
    const files = run(["diff", "--no-renames", "--name-only", "-z", base, head, "--"]).split("\0").filter(Boolean)
    return classifyChanges(files)
  } catch {
    console.warn("Could not determine changed files; running the complete CI suite.")
    return { ...FULL_SCOPE }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const scope = resolveScope({ event: process.env.CI_EVENT, base: process.env.CI_BASE, head: process.env.GITHUB_SHA })
  const outputs =
    Object.entries(scope)
      .map(([name, enabled]) => `${name}=${enabled}`)
      .join("\n") + "\n"
  appendFileSync(process.env.GITHUB_OUTPUT, outputs)
  console.log(outputs.trim())
}
