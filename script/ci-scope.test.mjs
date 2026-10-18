import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { classifyChanges, FULL_SCOPE, resolveScope } from "./ci-scope.mjs"

const directories = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe("CI change selection", () => {
  it("skips application checks for documentation and runs verification for unit tests", () => {
    expect(classifyChanges(["README.md", ".internal/reports/CI.md"])).toEqual({
      verify: false,
      build: false,
      native: false,
      packaged: false,
    })
    expect(
      classifyChanges(["script/runtime-pin.test.mjs", "desktop/packages/ui/src/sync/__tests__/replay.test.ts"]),
    ).toEqual({
      verify: true,
      build: false,
      native: false,
      packaged: false,
    })
  })

  it("runs the Windows-only electron/src tests through the native matrix", () => {
    expect(
      classifyChanges([
        "desktop/packages/electron/src/axcode-runtime-supervisor.test.mjs",
        "desktop/packages/electron/src/wiki-viewer.test.mjs",
      ]),
    ).toEqual({ verify: true, build: true, native: true, packaged: true })
  })

  it("builds and packages renderer changes without repeating unrelated native probes", () => {
    expect(
      classifyChanges(["desktop/packages/ui/src/components/Chat.tsx", "desktop/packages/web/public/icon.png"]),
    ).toEqual({
      verify: true,
      build: true,
      native: false,
      packaged: true,
    })
  })

  it.each([
    "desktop/packages/electron/src/main.js",
    "desktop/packages/electron/resources/launch-animations/manifest.json",
    "desktop/packages/electron/resources/help.md",
    "desktop/packages/electron/scripts/verify-packaged-electron.test.mjs",
    "desktop/packages/web/server/index.js",
    "desktop/packages/ui/package.json",
    "desktop/packages/web/vite.config.ts",
    "desktop/shared/dev-ports.json",
    "config/ax-code-runtime.json",
    ".github/workflows/desktop-ci.yml",
    "pnpm-lock.yaml",
    "vitest.config.ts",
    "tools/winget/generate-manifests.ts",
    ".internal/deploy/install.ps1",
    "script/desktop-windows-bootstrap.test.mjs",
    "script/windows-minisign-acl.test.mjs",
    "docs/new-executable.mjs",
    "future-unknown-file",
  ])("keeps complete coverage for %s", (file) => {
    expect(classifyChanges(["README.md", file])).toEqual(FULL_SCOPE)
  })

  it("examines all paths even when a native change follows more than 300 renderer changes", () => {
    const files = Array.from({ length: 350 }, (_, index) => `desktop/packages/ui/src/file-${index}.tsx`)
    expect(classifyChanges([...files, "desktop/packages/electron/src/main.js"])).toEqual(FULL_SCOPE)
  })

  it.each(["schedule", "workflow_dispatch", "unknown"])("runs the full suite for %s", (event) => {
    expect(resolveScope({ event })).toEqual(FULL_SCOPE)
  })

  it("runs the full suite for an initial push or unavailable diff", () => {
    expect(resolveScope({ event: "push", base: "0".repeat(40), head: "b".repeat(40) })).toEqual(FULL_SCOPE)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(
      resolveScope({
        event: "push",
        base: "a".repeat(40),
        head: "b".repeat(40),
        git() {
          throw new Error("missing history")
        },
      }),
    ).toEqual(FULL_SCOPE)
  })

  it("includes deleted native paths when Git reports a rename into the renderer", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-ci-scope-"))
    directories.push(cwd)
    const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
    git("init", "--quiet")
    git("config", "user.email", "ci-test@example.invalid")
    git("config", "user.name", "CI Test")
    git("config", "commit.gpgsign", "false")
    const native = "desktop/packages/electron/src/native.js"
    const renderer = "desktop/packages/ui/src/renamed.js"
    fs.mkdirSync(path.dirname(path.join(cwd, native)), { recursive: true })
    fs.writeFileSync(path.join(cwd, native), "native content\n")
    git("add", ".")
    git("commit", "--quiet", "-m", "Base")
    const base = git("rev-parse", "HEAD")
    fs.mkdirSync(path.dirname(path.join(cwd, renderer)), { recursive: true })
    git("mv", native, renderer)
    git("commit", "--quiet", "-m", "Rename")
    const head = git("rev-parse", "HEAD")
    expect(resolveScope({ event: "push", base, head, cwd })).toEqual(FULL_SCOPE)
    expect(resolveScope({ event: "pull_request", base, head, cwd })).toEqual(FULL_SCOPE)
  })
})
