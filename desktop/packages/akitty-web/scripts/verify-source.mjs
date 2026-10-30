import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)
const manifest = JSON.parse(await readFile(new URL("SOURCE.json", root), "utf8"))
const failures = []
for (const [file, expected] of Object.entries(manifest.files)) {
  try {
    const actual = createHash("sha256").update(await readFile(new URL(file, root))).digest("hex")
    if (actual !== expected) failures.push(`Changed upstream file: ${file}`)
  } catch {
    failures.push(`Missing upstream file: ${file}`)
  }
}
for (const directory of ["lib", "types", "test", "patches", "scripts"]) {
  for (const file of await readdir(new URL(`${directory}/`, root), { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue
    const relative = path.relative(fileURLToPath(root), path.join(file.parentPath, file.name)).split(path.sep).join("/")
    if (relative !== "scripts/verify-source.mjs" && !(relative in manifest.files)) {
      failures.push(`Unrecorded upstream file: ${relative}`)
    }
  }
}
if (failures.length) throw new Error(failures.join("\n"))
console.log(`AkiTTY Web ${manifest.version}: ${Object.keys(manifest.files).length} files verified at ${manifest.commit}`)
