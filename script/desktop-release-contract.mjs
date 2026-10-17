import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readReleasePolicy, repositoryRoot } from "./release-policy.mjs"
import { verifyRuntimePin } from "./runtime-pin.mjs"

export { repositoryRoot }
export const DESKTOP_IDENTITY_PATH = "config/desktop-identity.json"
export const SDK_PIN_PATH = "config/ax-code-sdk.json"

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Desktop release contract: ${message}`)
}

function readJson(root, relativePath, fileSystem) {
  return JSON.parse(fileSystem.readFileSync(path.join(root, relativePath), "utf8"))
}

function requireText(source, value, label) {
  assert(source.includes(value), `${label} must contain ${JSON.stringify(value)}`)
}

export function sha256File(file, fileSystem = fs) {
  return crypto.createHash("sha256").update(fileSystem.readFileSync(file)).digest("hex")
}

export function readDesktopIdentity(root = repositoryRoot, fileSystem = fs) {
  const identity = readJson(root, DESKTOP_IDENTITY_PATH, fileSystem)
  assert(identity?.schema === "ax-coder.desktop-identity.v1", "unsupported identity schema")
  assert(identity.productName === "AX Code", "productName changed during compatibility extraction")
  assert(identity.applicationId === "ai.defai.ax-code-app", "applicationId changed during compatibility extraction")
  assert(
    identity.artifactName === "AX-Code-${version}-${os}-${arch}.${ext}",
    "artifactName changed during compatibility extraction",
  )
  assert(identity.rendererOrigin === "app://ax-code", "rendererOrigin changed during compatibility extraction")
  assert(
    identity.updater?.repository === "defai-digital/ax-code-desktop",
    "updater must use the independent Desktop repository",
  )
  assert(identity.updater?.tagPrefix === "v", "independent Desktop updater tags must use v")
  assert(identity.credentials?.minisignKeychainService === "ax-minisign", "Minisign Keychain service changed")
  assert(identity.credentials?.minisignKeychainAccount === "ax-release", "Minisign Keychain account changed")
  for (const [field, pattern] of [
    ["baselineCommit", /^[a-f0-9]{40}$/],
    ["filteredCommit", /^[a-f0-9]{40}$/],
    ["importMerge", /^[a-f0-9]{40}$/],
  ]) {
    assert(pattern.test(identity.sourceExtraction?.[field] ?? ""), `sourceExtraction.${field} must be a commit`)
  }
  const mappingPath = path.resolve(root, identity.sourceExtraction?.mapping ?? "")
  const relativeMappingPath = path.relative(root, mappingPath)
  assert(
    relativeMappingPath && !relativeMappingPath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeMappingPath),
    "source extraction mapping must stay inside the repository",
  )
  assert(fileSystem.statSync(mappingPath).isFile(), "source extraction mapping is missing")
  return identity
}

export function verifyDesktopReleaseContract(root = repositoryRoot, fileSystem = fs) {
  const identity = readDesktopIdentity(root, fileSystem)
  const policy = readReleasePolicy(root, fileSystem)
  const runtime = verifyRuntimePin(root, fileSystem)
  const sdk = readJson(root, SDK_PIN_PATH, fileSystem)
  assert(sdk?.schema === "ax-coder.ax-code-sdk.v1", "unsupported SDK pin schema")
  assert(sdk.name === "@defai-digital/ax-code-sdk", "SDK package name changed")
  assert(sdk.specifier === `jsr:${sdk.name}@${sdk.version}`, "SDK specifier is not exact")
  assert(sdk.producerRepository === "defai-digital/ax-code", "SDK producer repository changed")
  assert(/^[a-f0-9]{40}$/.test(sdk.producerCommit ?? ""), "SDK producer commit is invalid")

  const manifests = {
    root: readJson(root, "package.json", fileSystem),
    electron: readJson(root, "desktop/packages/electron/package.json", fileSystem),
    web: readJson(root, "desktop/packages/web/package.json", fileSystem),
    ui: readJson(root, "desktop/packages/ui/package.json", fileSystem),
  }
  const versions = new Set(Object.values(manifests).map((manifest) => manifest.version))
  const electronPin = manifests.electron.devDependencies?.electron ?? ""
  assert(/^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/.test(electronPin), "Electron must use an exact version")
  assert(
    !electronPin.includes("-") || policy.publicRelease.enabled === false,
    "prerelease Electron candidates cannot qualify a public release",
  )
  assert(versions.size === 1, "Desktop package versions must match")
  assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifests.root.version), "Desktop version must be SemVer")
  assert(manifests.root.name === "ax-coder", "root package name must remain ax-coder")
  assert(manifests.electron.name === identity.packages.electron, "Electron package identity changed")
  assert(manifests.electron.desktopName === "ax-code-desktop.desktop", "Desktop filename identity changed")
  assert(manifests.electron.homepage === "https://github.com/defai-digital/ax-code", "compatibility homepage changed")
  assert(manifests.web.name === identity.packages.web, "web package identity changed")
  assert(manifests.web.bin?.[identity.packages.desktopCommand] === "./bin/cli.js", "Desktop command changed")
  assert(manifests.web.bin?.[identity.packages.legacyCommand] === "./bin/cli.js", "legacy command changed")
  assert(manifests.ui.name === identity.packages.ui, "UI package identity changed")
  assert(
    manifests.web.dependencies?.[sdk.name] === sdk.specifier && manifests.ui.dependencies?.[sdk.name] === sdk.specifier,
    "Desktop consumers must use the exact SDK pin",
  )

  const builder = fileSystem.readFileSync(path.join(root, "desktop/packages/electron/electron-builder.yml"), "utf8")
  requireText(builder, `appId: ${identity.applicationId}`, "electron-builder identity")
  requireText(builder, `productName: ${identity.productName}`, "electron-builder product name")
  requireText(builder, `artifactName: ${identity.artifactName}`, "electron-builder artifact name")
  requireText(builder, `publisherName: ${identity.signing.windowsPublisher}`, "Windows publisher")
  requireText(builder, `executableName: ${identity.packages.linuxExecutable}`, "Linux executable")
  requireText(builder, `packageName: ${identity.packages.linuxPackage}`, "Linux package")
  const [updaterOwner, updaterRepository] = identity.updater.repository.split("/")
  const [packageOwner, packageRepository] = (policy.cutover?.repository ?? identity.updater.repository).split("/")
  requireText(builder, `owner: ${packageOwner}`, "candidate release owner")
  requireText(builder, `repo: ${packageRepository}`, "candidate release repository")

  const updateFeed = fileSystem.readFileSync(
    path.join(root, "desktop/packages/electron/src/desktop-update-feed.js"),
    "utf8",
  )
  requireText(updateFeed, `const GITHUB_OWNER = "${updaterOwner}"`, "update feed owner")
  requireText(updateFeed, `const GITHUB_REPO = "${updaterRepository}"`, "update feed repository")
  requireText(updateFeed, `const DESKTOP_RELEASE_TAG_PREFIX = "${identity.updater.tagPrefix}"`, "update tag prefix")

  const rendererProtocol = fileSystem.readFileSync(
    path.join(root, "desktop/packages/electron/src/desktop-renderer-protocol.js"),
    "utf8",
  )
  requireText(rendererProtocol, 'const PACKAGED_RENDERER_SCHEME = "app"', "renderer scheme")
  requireText(rendererProtocol, 'const PACKAGED_RENDERER_HOST = "ax-code"', "renderer host")

  const appleSigning = fileSystem.readFileSync(
    path.join(root, "desktop/packages/electron/scripts/apple-signing.mjs"),
    "utf8",
  )
  requireText(appleSigning, `DEFAULT_APPLE_TEAM_ID = "${identity.signing.appleTeamId}"`, "Apple team")
  requireText(
    appleSigning,
    `DEFAULT_APPLE_KEYCHAIN_PROFILE = "${identity.signing.appleNotaryProfile}"`,
    "Apple notary profile",
  )

  const minisignScript = fileSystem.readFileSync(path.join(root, "desktop/scripts/minisign-artifacts.sh"), "utf8")
  requireText(
    minisignScript,
    `KEYCHAIN_SERVICE="\${AX_CODE_DESKTOP_MINISIGN_KEYCHAIN_SERVICE:-${identity.credentials.minisignKeychainService}}"`,
    "Minisign Keychain service",
  )
  requireText(
    minisignScript,
    `KEYCHAIN_ACCOUNT="\${AX_CODE_DESKTOP_MINISIGN_KEYCHAIN_ACCOUNT:-${identity.credentials.minisignKeychainAccount}}"`,
    "Minisign Keychain account",
  )

  const shadowWorkflow = fileSystem.readFileSync(path.join(root, ".github/workflows/desktop-shadow.yml"), "utf8")
  requireText(shadowWorkflow, "contents: read", "shadow workflow permissions")
  requireText(shadowWorkflow, `APPLE_TEAM_ID\" != \"${identity.signing.appleTeamId}`, "shadow Apple team gate")
  requireText(shadowWorkflow, identity.signing.appleAuthority, "shadow Apple signing authority")
  requireText(
    shadowWorkflow,
    "node script/apple-notary-credentials.mjs --configure",
    "verified Apple notarization credentials",
  )
  requireText(shadowWorkflow, '--keychain-profile "$APPLE_KEYCHAIN_PROFILE"', "DMG notarization profile")
  requireText(shadowWorkflow, identity.signing.windowsCertificateSha1, "shadow Windows certificate")
  requireText(shadowWorkflow, "--publish=never", "shadow packaging mode")
  requireText(shadowWorkflow, "node script/shadow-access-policy.mjs", "shadow artifact visibility gate")
  const shadowAccess = fileSystem.readFileSync(path.join(root, "script/shadow-access-policy.mjs"), "utf8")
  requireText(shadowAccess, 'visibility === "public" && signingMode !== "required"', "public signed-only gate")
  assert(
    (shadowWorkflow.match(/name: Sign staged artifacts before upload/g) ?? []).length === 4,
    "each packaging job must sign before upload",
  )

  const packageWrapper = fileSystem.readFileSync(
    path.join(root, "desktop/packages/electron/scripts/package.mjs"),
    "utf8",
  )
  requireText(packageWrapper, "assertPackagePublishingMode(args)", "Electron package policy")
  const legacyPublisher = fileSystem.readFileSync(path.join(root, "desktop/scripts/publish-github-release.sh"), "utf8")
  requireText(legacyPublisher, "script/release-policy.mjs assert-public", "legacy release policy")

  assert(policy.publicRelease.repository === identity.updater.repository, "release owner and updater owner diverged")

  return {
    identity,
    lockfile: {
      path: "pnpm-lock.yaml",
      sha256: sha256File(path.join(root, "pnpm-lock.yaml"), fileSystem),
    },
    manifests,
    policy,
    runtime,
    sdk,
  }
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const contract = verifyDesktopReleaseContract()
    console.log(
      `Desktop release contract check passed (app ${contract.manifests.root.version}, SDK ${contract.sdk.version}, runtime ${contract.runtime.version}, ${contract.policy.stage}).`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
