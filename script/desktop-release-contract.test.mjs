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
      version: "2.6.45",
      registry: "https://npm.pkg.github.com",
      producerTag: "sdk-v2.6.45",
      producerCommit: "12daba10489ea39f0244ce99fb45304e8d1f3e6c",
    })
    expect(contract.runtime).toMatchObject({ version: "7.28.4", releaseTag: "v7.28.4" })
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

  const withTextOverride = (relativePath, value) => ({
    ...fs,
    readFileSync(file, ...args) {
      return path.relative(repositoryRoot, file).split(path.sep).join("/") === relativePath
        ? value
        : fs.readFileSync(file, ...args)
    },
  })

  it("rejects required values that appear only in comments", () => {
    const updateFeed = [
      '// const GITHUB_OWNER = "defai-digital"',
      '// const GITHUB_REPO = "ax-code-desktop"',
      '// const DESKTOP_RELEASE_TAG_PREFIX = "v"',
      'const GITHUB_OWNER = "defai-digital"',
      'const GITHUB_REPO = "wrong-repository"',
      'const DESKTOP_RELEASE_TAG_PREFIX = "v"',
    ].join("\n")
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withTextOverride("desktop/packages/electron/src/desktop-update-feed.js", updateFeed),
      ),
    ).toThrow("update feed repository")
  })

  it("requires the exact SDK pin in the Electron consumer", () => {
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withOverrides({
          "desktop/packages/electron/package.json": (manifest) => {
            const dependencies = { ...manifest.dependencies }
            delete dependencies["@defai-digital/ax-code-sdk"]
            return { ...manifest, dependencies }
          },
        }),
      ),
    ).toThrow("Desktop consumers must use the exact SDK pin")
  })

  it("rejects an SDK pin that does not come from GitHub Packages", () => {
    const pin = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "config/ax-code-sdk.json"), "utf8"))
    for (const override of [
      { registry: "https://registry.npmjs.org" },
      { specifier: `jsr:${pin.name}@${pin.version}` },
      { producerTag: "sdk-v0.0.0" },
      { schema: "ax-coder.ax-code-sdk.v1" },
    ]) {
      expect(() =>
        verifyDesktopReleaseContract(
          repositoryRoot,
          withTextOverride("config/ax-code-sdk.json", JSON.stringify({ ...pin, ...override })),
        ),
      ).toThrow(/SDK/)
    }
  })

  it("requires the scope mapping and refuses a committed registry credential", () => {
    expect(() =>
      verifyDesktopReleaseContract(repositoryRoot, withTextOverride(".npmrc", "# no scope mapping\n")),
    ).toThrow("GitHub Packages in .npmrc")
    const scope = "@defai-digital:registry=https://npm.pkg.github.com\n"
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withTextOverride(".npmrc", `# //npm.pkg.github.com/:_authToken=ghp_example\n${scope}`),
      ),
    ).not.toThrow()
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withTextOverride(".npmrc", `${scope}//npm.pkg.github.com/:_authToken=ghp_example\n`),
      ),
    ).toThrow("must not hold a registry credential")
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withTextOverride(".npmrc", `${scope}//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}\n`),
      ),
    ).not.toThrow()
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
    expect(contract.runtime.version).toBe("7.28.4")
  })

  it("rejects a release tag prefix the updater would never see", () => {
    expect(() =>
      verifyDesktopReleaseContract(
        repositoryRoot,
        withOverrides({
          "config/desktop-release-policy.json": (policy) => ({
            ...policy,
            publicRelease: { ...policy.publicRelease, tagPrefix: "desktop-v" },
          }),
        }),
      ),
    ).toThrow("public release tag prefix must match the updater tag prefix")
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
