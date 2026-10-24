"use strict"

// Reads a webContents "console-message" event for the startup log. Electron 35+ hands the listener
// one Event<WebContentsConsoleMessageEventParams> whose `level` is a string ("debug", "info",
// "warning", "error"); the positional (event, level, message, line, sourceId) arguments that follow
// are deprecated. The previous reader took the second argument for a details object, found no
// `level` on the number it actually was, and dropped every renderer warning and error from main.log,
// which is how renderer-side failures such as a rejected settings save stopped leaving any trace.

const LEVEL_BY_NAME = { debug: 0, info: 1, warning: 2, error: 3 }

const levelOf = (value) => {
  if (typeof value === "number") return value
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(LEVEL_BY_NAME, value)) {
    return LEVEL_BY_NAME[value]
  }
  return -1
}

// Returns the warning-or-worse message to record, or null when there is nothing to record.
const readRendererConsoleWarning = (event, legacyLevel, legacyMessage, legacyLine, legacySourceId) => {
  const fromEvent = event && typeof event.message === "string"
  const level = levelOf(fromEvent ? event.level : legacyLevel)
  const message = fromEvent ? event.message : typeof legacyMessage === "string" ? legacyMessage : ""
  if (level < 2 || !message) return null
  return {
    level,
    message,
    line: fromEvent ? event.lineNumber : legacyLine,
    source: fromEvent ? event.sourceId : legacySourceId,
  }
}

module.exports = { readRendererConsoleWarning }
