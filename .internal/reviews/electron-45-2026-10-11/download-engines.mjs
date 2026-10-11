import { createRequire } from "node:module"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

const root = path.resolve(import.meta.dirname, "../../..")
const require = createRequire(path.join(root, "desktop/packages/electron/package.json"))
const electronRequire = createRequire(require.resolve("electron/package.json"))
const { downloadArtifact } = electronRequire("@electron/get")
const records = []
for (const version of ["44.7.0", "45.0.0-beta.1"]) {
  const archive = await downloadArtifact({ version, artifactName: "electron", platform: process.platform, arch: process.arch })
  const destination = path.join(import.meta.dirname, "engines", version)
  await mkdir(destination, { recursive: true })
  execFileSync("/usr/bin/ditto", ["-x", "-k", archive, destination])
  records.push({ version, archive, sha256: createHash("sha256").update(await readFile(archive)).digest("hex"), binary: path.join(destination, "Electron.app/Contents/MacOS/Electron"), downloadChecksumValidation: "@electron/get default validation enabled" })
  console.log(`Downloaded and extracted Electron ${version}`)
  await writeFile(path.join(import.meta.dirname, "engines.json"), JSON.stringify(records, null, 2) + "\n")
}
