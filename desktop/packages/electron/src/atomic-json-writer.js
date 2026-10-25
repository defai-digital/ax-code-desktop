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
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      await filesystem.writeFile(tmp, JSON.stringify(data, null, 2))
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
      await filesystem.rm(tmp, { force: true }).catch(() => {})
      throw error
    }
  }
}

module.exports = { createAtomicJsonWriter }
