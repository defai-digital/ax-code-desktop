import assert from "node:assert/strict"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "../../..")
const read = async (file) => JSON.parse(await readFile(path.join(import.meta.dirname, file), "utf8"))
const baseline = (await read("probes/baseline-final/summary.json")).records
const candidate = (await read("probes/candidate-final/summary.json")).records
for (const [records, version] of [[baseline, "44.7.0"], [candidate, "45.0.0-beta.1"]]) {
  assert.equal(records.length, 3)
  assert.deepEqual(records.map((record) => record.featureEnabled), [false, true, true])
  for (const record of records) {
    assert.equal(record.electron, version)
    assert.equal(record.passed, true)
    assert.equal(record.productionQualified, false)
    assert.equal(record.platform, "darwin")
    assert.equal(record.arch, "arm64")
  }
}
const compatibilityLog = await readFile(path.join(import.meta.dirname, "compatibility-final.log"), "utf8")
const compatibility = JSON.parse(compatibilityLog.split("\n").find((line) => line.startsWith('{"electron"')))
assert.equal(compatibility.nativeMenus, 14)
assert.equal(compatibility.ptyRoundTrip, true)
assert.equal(compatibility.electron, "45.0.0-beta.1")
const engines = await read("engines.json")
const installation = await read("fresh-install-evidence.json")
const scripts = {}
for (const name of ["probe-native-webmcp.cjs", "smoke-native-webmcp.mjs", "smoke-electron-compatibility.cjs", "smoke-electron-compatibility.mjs"]) {
  scripts[name] = createHash("sha256").update(await readFile(path.join(root, "desktop/packages/electron/scripts", name))).digest("hex")
}
const evidence = {
  schema: "ax-coder.electron-45-candidate-evidence.v1",
  qualification: "Local controlled fixtures and ad-hoc macOS arm64 packaging only",
  productionQualified: false,
  archives: engines.map(({ version, sha256, downloadChecksumValidation }) => ({ version, sha256, downloadChecksumValidation })),
  installation,
  scripts,
  compatibility,
  baseline,
  candidate,
}
const target = path.join(root, ".internal/reports/electron-45-2026-10-11")
await mkdir(target, { recursive: true })
await writeFile(path.join(target, "native-evidence.json"), JSON.stringify(evidence, null, 2) + "\n")
console.log("Recorded six native engine observations and the real Electron ABI/menu smoke")
