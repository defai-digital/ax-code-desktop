"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")

function createAtomicJsonWriter({
  filesystem = fs,
  platform = process.platform,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  return async function writeJsonFile(filePath, data) {
    await filesystem.mkdir(path.dirname(filePath), { recursive: true })
    const serialized = JSON.stringify(data, null, 2)
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let ownsTemporaryFile = false
    try {
      // Owner-only: settings carry secrets such as the UI password hash, and the rename gives the target this
      // file's mode. Exclusive creation also refuses another writer's file or a substituted symlink.
      const file = await filesystem.open(tmp, "wx", 0o600)
      ownsTemporaryFile = true
      try {
        await file.writeFile(serialized)
      } finally {
        // Windows cannot replace a file while this process still holds its write handle.
        await file.close()
      }
      // Windows readers/antivirus can briefly hold the destination. Retry the
      // atomic replacement without deleting the last valid settings snapshot.
      for (let attempt = 1; ; attempt++) {
        try {
          await filesystem.rename(tmp, filePath)
          return
        } catch (error) {
          if (platform !== "win32" || attempt >= 6 || !["EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error
          await wait(25 * attempt)
        }
      }
    } catch (error) {
      if (ownsTemporaryFile) await filesystem.rm(tmp, { force: true }).catch(() => {})
      throw error
    }
  }
}

module.exports = { createAtomicJsonWriter }
