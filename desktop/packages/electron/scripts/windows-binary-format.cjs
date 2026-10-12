// Share the signing and audit classification so foreign dependency prebuilds are
// preserved byte-for-byte without weakening the Windows PE signature gate.
const fs = require("node:fs")
const path = require("node:path")

function classifyHeader(file, header, peSignature) {
  if (
    header.length >= 64 &&
    header[0] === 0x4d &&
    header[1] === 0x5a &&
    peSignature?.equals(Buffer.from([0x50, 0x45, 0, 0]))
  )
    return "pe"

  const normalized = file.replace(/\\/g, "/")
  const platform = normalized.match(
    /(?:^|\/)resources\/(?:ax-code\/node_modules\/.+|app\.asar\.unpacked\/node_modules\/node-pty)\/prebuilds\/(linux|darwin)-[^/]+\/[^/]+\.node$/,
  )?.[1]
  const magic = header.subarray(0, 4).toString("hex")
  if (platform === "linux" && magic === "7f454c46") return "foreign"
  if (
    platform === "darwin" &&
    ["feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(magic)
  )
    return "foreign"
  throw new Error(`Unrecognized Windows signing target: ${file}`)
}

function classifyFile(file) {
  const fd = fs.openSync(file, "r")
  try {
    const header = Buffer.alloc(64)
    const length = fs.readSync(fd, header, 0, header.length, 0)
    let signature
    if (length === 64 && header[0] === 0x4d && header[1] === 0x5a) {
      const offset = header.readUInt32LE(0x3c)
      if (offset >= 64 && offset <= fs.fstatSync(fd).size - 4) {
        signature = Buffer.alloc(4)
        fs.readSync(fd, signature, 0, 4, offset)
      }
    }
    return classifyHeader(file, header.subarray(0, length), signature)
  } finally {
    fs.closeSync(fd)
  }
}

function collectPeFiles(root) {
  const files = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if ([".exe", ".dll", ".node"].includes(path.extname(entry.name).toLowerCase())) {
        if (classifyFile(file) === "pe") files.push(file)
      }
    }
  }
  visit(path.resolve(root))
  return files
}

module.exports = { classifyFile, collectPeFiles }
if (require.main === module) {
  if (process.argv.length !== 3) throw new Error("Usage: windows-binary-format.cjs <package-root>")
  process.stdout.write(JSON.stringify(collectPeFiles(process.argv[2])))
}
