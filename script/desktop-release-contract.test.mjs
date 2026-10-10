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
      updater: { repository: "defai-digital/ax-code", tagPrefix: "desktop-v" },
    })
    expect(contract.sdk).toMatchObject({
      name: "@defai-digital/ax-code-sdk",
      version: "2.6.7",
      producerCommit: "7c10b3af5c1d48ee773e88c82c4be830206d9168",
    })
    expect(contract.runtime).toMatchObject({ version: "7.10.2", releaseTag: "v7.10.2" })
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

  it("keeps the updater and installed application identity on AX Code until cutover", () => {
    const builder = fs.readFileSync(path.join(repositoryRoot, "desktop/packages/electron/electron-builder.yml"), "utf8")
    const updater = fs.readFileSync(
      path.join(repositoryRoot, "desktop/packages/electron/src/desktop-update-feed.js"),
      "utf8",
    )
    expect(builder).toContain("appId: ai.defai.ax-code-app")
    expect(builder).toContain("productName: AX Code")
    expect(builder).toContain("owner: defai-digital\n  repo: ax-code")
    expect(updater).toContain('const GITHUB_REPO = "ax-code"')
  })
})
