import fs from "node:fs"
import path from "node:path"
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

  it("cannot create or mutate a public release", () => {
    expect(shadow).toContain("contents: read")
    expect(shadow).not.toContain("contents: write")
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
