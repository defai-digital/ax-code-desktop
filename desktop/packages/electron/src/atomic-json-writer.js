"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")

const MAX_TEMPORARY_NAME_ATTEMPTS = 4

function defaultTemporaryName(filePath) {
  return `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`
}

function createAtomicJsonWriter({
  filesystem = fs,
  platform = process.platform,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  temporaryName = defaultTemporaryName,
} = {}) {
  // Exclusive creation refuses another writer's file or a substituted symlink. A stale or foreign file at one
  // name must not drop the save, so pick a fresh name a bounded number of times before giving up.
  async function openTemporaryFile(filePath) {
    for (let attempt = 1; ; attempt++) {
      const tmp = temporaryName(filePath)
      try {
        // Owner-only: settings carry secrets such as the UI password hash, and the rename gives the target this
        // file's mode.
        return { tmp, file: await filesystem.open(tmp, "wx", 0o600) }
      } catch (error) {
        if (error?.code !== "EEXIST" || attempt >= MAX_TEMPORARY_NAME_ATTEMPTS) throw error
      }
    }
  }

  return async function writeJsonFile(filePath, data) {
    const serialized = JSON.stringify(data, null, 2)
    // JSON.stringify returns undefined for undefined, functions and symbols; reject before touching the disk.
    if (typeof serialized !== "string") throw new TypeError("Cannot write a value that has no JSON representation")
    await filesystem.mkdir(path.dirname(filePath), { recursive: true })
    const { tmp, file } = await openTemporaryFile(filePath)
    try {
      let writeError
      try {
        await file.writeFile(serialized)
        // Flush before the rename so a crash cannot publish an empty or truncated settings file.
        await file.sync()
      } catch (error) {
        writeError = error
      }
      // Windows cannot replace a file while this process still holds its write handle. A close failure must not
      // hide the original write failure (for example ENOSPC).
      try {
        await file.close()
      } catch (closeError) {
        if (!writeError) writeError = closeError
      }
      if (writeError) throw writeError
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
