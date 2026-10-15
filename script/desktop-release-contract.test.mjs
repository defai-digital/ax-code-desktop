import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { readDesktopIdentity, repositoryRoot, verifyDesktopReleaseContract } from "./desktop-release-contract.mjs"

describe("Desktop release contract", () => {
  it("freezes the compatibility identity and release inputs", () => {
    const contract = verifyDesktopReleaseContract(repositoryRoot)
    expect(contract.identity).toMatchObject({
      productName: "AX Code",
      applicationId: "ai.defai.ax-code-app",
      rendererOrigin: "app://ax-code",
      updater: { repository: "defai-digital/ax-code-desktop", tagPrefix: "v" },
    })
    expect(contract.sdk).toMatchObject({
      name: "@defai-digital/ax-code-sdk",
      version: "2.6.17",
      producerCommit: "acc03b6f8558041a4a2b80c921819875933acfe5",
    })
    expect(contract.runtime).toMatchObject({ version: "7.25.8", releaseTag: "v7.25.8" })
    expect(contract.lockfile.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it("binds identity evidence to the retained extraction map", () => {
    const identity = readDesktopIdentity(repositoryRoot)
    const mapping = path.join(repositoryRoot, identity.sourceExtraction.mapping)
    expect(fs.statSync(mapping).isFile()).toBe(true)
    expect(identity.sourceExtraction).toEqual({
      repository: "defai-digital/ax-code",
      baselineCommit: "1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c",
      filteredCommit: "8a045fc0ad71ef9f768a695e242fabcbec6ebcd3",
      importMerge: "a1d62422f150cb775875e58f22db171b91e9d0be",
      mapping: ".internal/reports/extraction/commit-map.txt",
    })
  })

  it("switches the updater channel while preserving installed application identity", () => {
    const builder = fs.readFileSync(path.join(repositoryRoot, "desktop/packages/electron/electron-builder.yml"), "utf8")
    const updater = fs.readFileSync(
      path.join(repositoryRoot, "desktop/packages/electron/src/desktop-update-feed.js"),
      "utf8",
    )
    expect(builder).toContain("appId: ai.defai.ax-code-app")
    expect(builder).toContain("productName: AX Code")
    expect(builder).toContain("repo: ax-code-desktop")
    expect(updater).toContain('const GITHUB_REPO = "ax-code-desktop"')
  })

  const withOverrides = (overrides) => ({
    ...fs,
    readFileSync(file, ...args) {
      const original = fs.readFileSync(file, ...args)
      const update = overrides[path.relative(repositoryRoot, file).split(path.sep).join("/")]
      return update ? JSON.stringify(update(JSON.parse(String(original)))) : original
    },
  })

  it("rejects floating Electron dependencies", () => {
    const fileSystem = withOverrides({
      "desktop/packages/electron/package.json": (manifest) => ({
        ...manifest,
        devDependencies: { ...manifest.devDependencies, electron: "^45.0.0" },
      }),
    })
    expect(() => verifyDesktopReleaseContract(repositoryRoot, fileSystem)).toThrow("Electron must use an exact version")
  })

  it("allows Desktop patch releases without changing the independently signed runtime", () => {
    const overrides = Object.fromEntries(
      [
        "package.json",
        "desktop/packages/electron/package.json",
        "desktop/packages/web/package.json",
        "desktop/packages/ui/package.json",
      ].map((file) => [file, (manifest) => ({ ...manifest, version: "7.24.99" })]),
    )
    const contract = verifyDesktopReleaseContract(repositoryRoot, withOverrides(overrides))
    expect(contract.manifests.root.version).toBe("7.24.99")
    expect(contract.runtime.version).toBe("7.25.8")
  })

  it("rejects mismatched Desktop package versions", () => {
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withOverrides({
          "package.json": (manifest) => ({ ...manifest, version: "7.24.99" }),
        }),
      ),
    ).toThrow("Desktop package versions must match")
  })

  it("blocks prerelease Electron even after public cutover approval", () => {
    const fileSystem = withOverrides({
      "config/desktop-release-policy.json": (policy) => ({
        ...policy,
        stage: "cutover-approved",
        publicRelease: { ...policy.publicRelease, enabled: true },
      }),
      "desktop/packages/electron/package.json": (manifest) => ({
        ...manifest,
        devDependencies: { ...manifest.devDependencies, electron: "45.0.0-beta.1" },
      }),
    })
    expect(() => verifyDesktopReleaseContract(repositoryRoot, fileSystem)).toThrow(
      "prerelease Electron candidates cannot qualify a public release",
    )
  })
})
