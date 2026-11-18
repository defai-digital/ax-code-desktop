import { randomUUID } from "crypto"
import fs from "fs"
import path from "path"

// These stores expose synchronous read/modify/write APIs. Publish only after
// closing the exclusive, owner-only file so a failed save keeps the prior copy.
export function writePrivateFileSync(target, text) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.${randomUUID()}.tmp`
  const fd = fs.openSync(temporary, "wx", 0o600)
  try {
    try {
      fs.writeFileSync(fd, text)
      fs.fsyncSync(fd)
    } catch (error) {
      try { fs.closeSync(fd) } catch {}
      throw error
    }
    fs.closeSync(fd)
    fs.renameSync(temporary, target)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch {}
    throw error
  }
}
