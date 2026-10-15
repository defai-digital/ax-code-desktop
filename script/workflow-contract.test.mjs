import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "..")
const read = (file) => fs.readFileSync(path.join(repositoryRoot, file), "utf8")
const ci = read(".github/workflows/desktop-ci.yml")
const codeql = read(".github/workflows/codeql.yml")
const shadow = read(".github/workflows/desktop-shadow.yml")

function triggerBlock(workflow) {
  return workflow.slice(workflow.indexOf("on:\n"), workflow.indexOf("\nconcurrency:"))
}

describe("Desktop workflow contracts", () => {
  it("runs independent CI from a frozen lockfile", () => {
    expect(ci).toContain("pnpm install --frozen-lockfile")
    expect(ci).toContain("pnpm run check:boundaries")
    expect(ci).toContain("pnpm run typecheck")
    expect(ci).toContain("pnpm run lint")
    expect(ci).toContain("pnpm run test")
    expect(ci).toContain("pnpm run build")
    expect(ci).toContain("--publish=never")
    expect(ci).toContain('AX_CODE_STAGE_REQUIRED: "true"')
  })

  it("scans only AX Coder languages and Actions", () => {
    expect(codeql).toContain("languages: javascript-typescript,actions")
    expect(codeql).not.toContain("languages: rust")
    expect(codeql).toContain("security-events: write")
    expect(codeql).not.toContain("continue-on-error: true")
    expect(codeql).not.toContain("upload: never")
  })

  it("keeps weekly and manual complete checks and gates expensive jobs using the Git diff", () => {
    const triggers = triggerBlock(ci)
    expect(triggers).toContain("schedule:")
    expect(triggers).toContain("workflow_dispatch:")
    expect(triggers).not.toContain("paths:")
    expect(ci).toContain("github.event.pull_request.base.sha || github.event.before")
    for (const [job, output] of [
      ["verify", "verify"],
      ["electron-native-compatibility", "native"],
      ["packaged-macos-smoke", "packaged"],
    ]) {
      expect(ci).toContain(`  ${job}:\n    needs: changes\n    if: needs.changes.outputs.${output} == 'true'`)
    }
  })

  it("builds Web once before copying assets and rebuilding Electron native modules", () => {
    const require = createRequire(import.meta.url)
    const graph = JSON.parse(
      execFileSync(
        process.execPath,
        [require.resolve("turbo/bin/turbo"), "run", "build:shell", "--filter=@ax-code/electron", "--dry=json"],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          timeout: 30_000,
          maxBuffer: 16 * 1024 * 1024,
        },
      ),
    )
    const web = graph.tasks.find((task) => task.taskId === "ax-code-desktop#build")
    const shell = graph.tasks.find((task) => task.taskId === "@ax-code/electron#build:shell")
    expect(graph.tasks.filter((task) => task.command === "vite build")).toHaveLength(1)
    for (const input of ["../../postcss.config.js", "../../vite-theme-plugin.ts", "../../shared/dev-ports.json"]) {
      expect(Object.keys(web.inputs)).toContain(input)
    }
    expect(shell.dependencies).toContain(web.taskId)
    expect(shell.command).toContain("copy-web-assets.mjs")
    expect(shell.command).toContain("bundle:main")
    expect(shell.command).toContain("rebuild:native")
    expect(shell.command).not.toContain("build:web-assets")
    const turbo = JSON.parse(read("turbo.json"))
    expect(turbo.tasks["@ax-code/electron#build:shell"].cache).toBe(false)
    expect(JSON.parse(read("package.json")).scripts.build).toBe("turbo run build:shell --filter=@ax-code/electron")
  })

  it("allows only manually acknowledged shadow runs", () => {
    const triggers = triggerBlock(shadow)
    expect(triggers).toContain("workflow_dispatch:")
    expect(triggers).toContain("confirm_shadow_only:")
    expect(triggers).not.toContain("push:")
    expect(triggers).not.toContain("pull_request:")
    expect(triggers).not.toContain("tags:")
    expect(shadow).toContain("REPOSITORY_VISIBILITY: ${{ github.event.repository.visibility }}")
    expect(shadow).toContain("node script/shadow-access-policy.mjs")
    expect(shadow).toContain("SIGNING_MODE: ${{ inputs.signing_mode }}")
  })

  it("does not create or mutate a public release", () => {
    expect(shadow).toContain("contents: read")
    expect(shadow.slice(0, shadow.indexOf("\njobs:"))).toContain("contents: read")
    const jobs = [...shadow.matchAll(/^  ([a-z][a-z-]+):\n([\s\S]*?)(?=^  [a-z][a-z-]+:|$(?![\s\S]))/gm)]
    expect(jobs.filter(([, , body]) => body.includes("contents: write")).map(([, name]) => name)).toEqual([
      "package-macos",
      "package-windows",
      "package-linux",
    ])
    expect(ci).not.toContain("contents: write")
    for (const forbidden of [
      "softprops/action-gh-release",
      "gh release",
      "github-release-assets",
      "--publish=always",
      "--publish onTag",
      "create-release",
      "finalize-release",
    ]) {
      expect(shadow).not.toContain(forbidden)
    }
    const packageCommands = shadow.split("\n").filter((line) => line.includes("package:desktop"))
    expect(packageCommands).toHaveLength(4)
    for (const command of packageCommands) expect(command).toContain("--publish=never")
  })

  it("covers every release target and explicit signing mode", () => {
    expect(ci).not.toContain("windows-11-arm")
    expect(shadow).not.toContain("win32-arm64")
    for (const target of ["darwin-arm64", "win32-x64", "linux-x64", "linux-arm64", "web"]) {
      expect(shadow).toContain(target)
    }
    expect(shadow).toContain("signing_mode:")
    expect(shadow).toContain("inputs.signing_mode == 'required'")
    expect(shadow).toContain("AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64")
    expect(shadow).toContain("--require-clean")
    expect(shadow).toContain("shadow-release-summary.mjs")
    expect(shadow).toContain("actions/upload-artifact@v7")
  })
})

it("signs every staged platform before upload while keeping official publication disabled", () => {
  for (const job of ["package-web", "package-macos", "package-windows", "package-linux"]) {
    const start = shadow.indexOf(`  ${job}:`)
    // Job bodies end at the next unindented two-space job header, not a step.
    const body = shadow.slice(start).split(/\n  [a-z][a-z-]+:/)[0]
    expect(start).toBeGreaterThan(0)
    expect(body.indexOf("Sign staged artifacts before upload")).toBeGreaterThan(0)
    expect(body.indexOf("Sign staged artifacts before upload")).toBeLessThan(body.indexOf("Upload staged"))
    expect(body).toContain("AX_CODER_SHADOW_SIGNING_MODE: required")
    expect(body).toContain("inputs.signing_mode == 'required'")
  }
})

it("uses verified Keychain notarization for either complete Apple credential strategy", () => {
  expect(shadow).toContain("node script/apple-notary-credentials.mjs --configure")
  expect(shadow).toContain("APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}")
  expect(shadow).toContain(
    'notarytool submit "$dmg" --keychain-profile "$APPLE_KEYCHAIN_PROFILE" --keychain "$APPLE_KEYCHAIN" --wait',
  )
  expect(shadow).not.toContain('notarytool submit "$dmg" --key "$APPLE_API_KEY"')
})
