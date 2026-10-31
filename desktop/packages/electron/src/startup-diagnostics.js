"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const REDACTED = "[redacted]"
const REDACT_KEY_RE = /authorization|cookie|password|secret|token|key/i
// The log file is appended for the whole session (renderer warnings arrive with
// `once: false`), so its size is checked every N appends and rotated once over
// the cap. Checking on every append would put a filesystem call per event back
// on the main thread.
const LOG_SIZE_CHECK_EVERY = 128
const LOG_MAX_BYTES = 2 * 1024 * 1024

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function sanitizeDetails(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (depth > 3) return "[truncated]"
  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}...` : value
  }
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeDetails(entry, depth + 1))
  }
  if (!isPlainObject(value)) return String(value)

  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = REDACT_KEY_RE.test(key) ? REDACTED : sanitizeDetails(entry, depth + 1)
  }
  return result
}

function createStartupDiagnostics(options = {}) {
  const bootId = options.bootId || crypto.randomUUID()
  const startedAtEpochMs = Date.now()
  const source = options.source || "electron-main"
  const logPath = options.logPath
  const maxEvents = options.maxEvents || 256
  const maxLogBytes = options.maxLogBytes || LOG_MAX_BYTES
  const fsImpl = options.fs || fs
  const events = []
  const seenMilestones = new Set()
  let logDirectoryReady = false
  // Start at the threshold so the first append of a process checks the file
  // inherited from earlier sessions; a quiet session never reaches 128 events.
  let appendsSinceSizeCheck = LOG_SIZE_CHECK_EVERY
  let rotating = false

  function rotateLogIfLarge() {
    if (rotating) return
    rotating = true
    try {
      fsImpl.stat(logPath, (error, stats) => {
        if (error || !stats || !(stats.size > maxLogBytes)) {
          rotating = false
          return
        }
        fsImpl.rename(logPath, `${logPath}.1`, (renameError) => {
          if (!renameError) {
            rotating = false
            return
          }
          // A rename can fail while the rotated file is held open (Windows); the
          // cap still has to hold, so the log is truncated instead.
          fsImpl.truncate(logPath, 0, () => {
            rotating = false
          })
        })
      })
    } catch {
      rotating = false
    }
  }

  function appendLog(event) {
    if (!logPath) return
    try {
      // One synchronous mkdir per process, not per event: a renderer warning storm
      // used to pay a recursive mkdirSync on the main thread for every line. A
      // failed append (directory removed at runtime) re-arms it; the line that
      // failed is lost, which is accepted for a diagnostic log.
      if (!logDirectoryReady) {
        fsImpl.mkdirSync(path.dirname(logPath), { recursive: true })
        logDirectoryReady = true
      }
      fsImpl.appendFile(logPath, `[startup] ${JSON.stringify(event)}\n`, (error) => {
        if (error) logDirectoryReady = false
      })
      appendsSinceSizeCheck += 1
      if (appendsSinceSizeCheck >= LOG_SIZE_CHECK_EVERY) {
        appendsSinceSizeCheck = 0
        rotateLogIfLarge()
      }
    } catch {
      logDirectoryReady = false
    }
  }

  function normalizeEvent(name, details = {}, eventOptions = {}) {
    if (typeof name !== "string" || name.trim().length === 0) return null
    const atEpochMs = Number.isFinite(eventOptions.atEpochMs) ? eventOptions.atEpochMs : Date.now()
    return {
      name: name.trim(),
      source:
        typeof eventOptions.source === "string" && eventOptions.source.trim().length > 0
          ? eventOptions.source.trim()
          : source,
      atEpochMs,
      sinceStartMs: Math.max(0, Math.round(atEpochMs - startedAtEpochMs)),
      details: sanitizeDetails(details),
    }
  }

  function record(name, details = {}, eventOptions = {}) {
    const event = normalizeEvent(name, details, eventOptions)
    if (!event) return null
    events.push(event)
    seenMilestones.add(event.name)
    while (events.length > maxEvents) events.shift()
    appendLog(event)
    return event
  }

  function markOnce(name, details = {}, eventOptions = {}) {
    const milestone = eventOptions.milestone || name
    if (seenMilestones.has(milestone)) return null
    const event = record(name, details, eventOptions)
    if (event) seenMilestones.add(milestone)
    return event
  }

  function snapshot() {
    return {
      bootId,
      startedAtEpochMs,
      startedAt: new Date(startedAtEpochMs).toISOString(),
      generatedAtEpochMs: Date.now(),
      events: [...events],
    }
  }

  return {
    bootId,
    record,
    markOnce,
    snapshot,
    logPath,
  }
}

module.exports = {
  createStartupDiagnostics,
}
