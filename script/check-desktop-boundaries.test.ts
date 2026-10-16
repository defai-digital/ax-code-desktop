import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  DESKTOP_BOUNDARY_REASONS,
  analyzeDesktopManifest,
  analyzeDesktopSource,
  collectDesktopBoundaryViolations,
  collectDesktopSourceFiles,
} from "./check-desktop-boundaries"

const root = path.resolve(import.meta.dirname, "..")
const webSource = path.join(root, "desktop/packages/web/src/fixture.ts")
const webServer = path.join(root, "desktop/packages/web/server/fixture.js")
const uiSource = path.join(root, "desktop/packages/ui/src/fixture.ts")

function reasons(file: string, source: string) {
  return analyzeDesktopSource(file, source).map((item) => item.reason)
}

describe("Desktop source boundaries", () => {
  test("allows documented UI and SDK entrypoints", () => {
    const source = [
      'import "@openchamber/ui/main"',
      'export type { RuntimeAPIs } from "@openchamber/ui/api/types"',
      'const app = import("@openchamber/ui/apps/renderElectronMiniChatApp")',
      'import { createClient } from "@defai-digital/ax-code-sdk/v2"',
    ].join("\n")

    expect(analyzeDesktopSource(webSource, source)).toEqual([])
  })

  test("blocks package-style and relative imports of private runtime modules", () => {
    const source = [
      'import "ax-code/session/private"',
      'export { provider } from "../../../../packages/ax-code/src/provider/private"',
    ].join("\n")

    expect(reasons(webServer, source)).toEqual([
      DESKTOP_BOUNDARY_REASONS.privateRuntime,
      DESKTOP_BOUNDARY_REASONS.privateRuntime,
    ])
  })

  test("blocks SDK internals while ignoring import-like comments and strings", () => {
    const source = [
      '// import "@defai-digital/ax-code-sdk/dist/comment-only"',
      'const example = "require(\\\"@defai-digital/ax-code-sdk/src/string-only\\\")"',
      'const sdk = require("@defai-digital/ax-code-sdk/dist/v2/index.js")',
    ].join("\n")

    const violations = analyzeDesktopSource(webServer, source)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      line: 3,
      specifier: "@defai-digital/ax-code-sdk/dist/v2/index.js",
      reason: DESKTOP_BOUNDARY_REASONS.sdkInternals,
    })
  })

  test("blocks private UI entrypoints, the cross-package web alias, and sibling source paths", () => {
    const source = [
      'import "@openchamber/ui/private/store"',
      'import "@/private/store"',
      'import "../../ui/src/private/store"',
    ].join("\n")

    expect(reasons(webSource, source)).toEqual([
      DESKTOP_BOUNDARY_REASONS.privateUi,
      DESKTOP_BOUNDARY_REASONS.webUiAlias,
      DESKTOP_BOUNDARY_REASONS.siblingSource,
    ])
  })

  test("blocks an alias that walks out of the UI source tree", () => {
    // The alias is normalized before the web rule looked at it, so `@/../electron/src/x.js` in the
    // web package collapsed to a plain relative path and passed both rules that exist for it.
    expect(reasons(webSource, 'import "@/../electron/src/api-prefix-router.js"')).toEqual([
      DESKTOP_BOUNDARY_REASONS.webUiAlias,
    ])
    expect(reasons(uiSource, 'import "@/../../electron/src/api-prefix-router.js"')).toEqual([
      DESKTOP_BOUNDARY_REASONS.siblingSource,
    ])
  })

  test("allows the UI package to use its own local alias", () => {
    expect(analyzeDesktopSource(uiSource, 'import "@/lib/http"')).toEqual([])
  })

  test("allows only the reviewed dev-only sibling source import", () => {
    const devProxy = path.join(root, "desktop/packages/web/vite-api-runtime-proxy.ts")
    const siblingRootFile = path.join(root, "desktop/packages/web/vite-api-ws-proxy.ts")
    const reviewed = 'const router = require("../electron/src/api-prefix-router.js")'

    expect(analyzeDesktopSource(devProxy, reviewed)).toEqual([])
    // the identical specifier from another file at the same depth is still a violation
    expect(reasons(siblingRootFile, reviewed)).toEqual([DESKTOP_BOUNDARY_REASONS.siblingSource])
    // a different sibling import in the reviewed file is still a violation
    expect(reasons(devProxy, 'import other from "../electron/src/other.js"')).toEqual([
      DESKTOP_BOUNDARY_REASONS.siblingSource,
    ])
  })
})

describe("Desktop manifest boundaries", () => {
  test("blocks server and shell dependencies in every UI dependency section", () => {
    const manifest = JSON.stringify(
      {
        dependencies: { react: "1.0.0", express: "1.0.0" },
        optionalDependencies: { electron: "1.0.0" },
      },
      null,
      2,
    )
    const file = path.join(root, "desktop/packages/ui/package.json")

    expect(analyzeDesktopManifest(file, manifest).map((item) => item.specifier)).toEqual(["express", "electron"])
  })
})

// This integration check parses the entire Desktop tree on shared CI runners.
test("the current Desktop tree satisfies the authoritative boundary policy", async () => {
  expect(await collectDesktopBoundaryViolations()).toEqual([])
}, 30_000)

test("the scan covers the package script trees, not only src and server", async () => {
  const files = await collectDesktopSourceFiles()
  const covered = (directory: string) => files.some((file) => file.includes(`/desktop/packages/${directory}/`))

  expect(covered("ui/src")).toBe(true)
  expect(covered("ui/scripts")).toBe(true)
  expect(covered("web/src")).toBe(true)
  expect(covered("web/server")).toBe(true)
  expect(covered("web/scripts")).toBe(true)
  expect(covered("electron/src")).toBe(true)
  expect(covered("electron/scripts")).toBe(true)
})
