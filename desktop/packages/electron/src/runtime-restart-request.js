"use strict"

// S2.5c (SPEC-2026-08-29-desktop-process-model-collapse §5 S2.5): handles the
// web server's `{ type: "runtime-restart-request" }` utilityProcess message.
// The web posts it from refreshAxCodeAfterConfigChange when the runtime is
// main-supervised (external mode) and settings.axCodeBinary may have changed:
// only main can restart the supervised runtime so the new binary takes
// effect. Main restarts with reprepare so the binary re-resolves.
//
// Restarts are serialized: while one is in flight, further requests are
// remembered and one more restart runs when it settles — the in-flight
// restart resolved the binary before the latest settings change landed, so
// ignoring the request left the runtime on the old binary indefinitely.
// Extracted from main.js so the policy is unit-testable without Electron.

function createRuntimeRestartRequestHandler({ getSupervision, logger = console } = {}) {
  if (typeof getSupervision !== "function") {
    throw new TypeError("createRuntimeRestartRequestHandler requires a getSupervision() function")
  }
  let inFlight = false
  let pendingRestart = false

  function requestRestart() {
    const supervision = getSupervision()
    if (!supervision) return false
    if (inFlight) {
      pendingRestart = true
      return true
    }
    inFlight = true
    let result
    try {
      result = supervision.restart({ reprepare: true })
    } catch (error) {
      result = Promise.reject(error)
    }
    Promise.resolve(result)
      .then(
        () => logger.log("[electron] ax-code runtime restarted after a configuration change"),
        (error) =>
          logger.error(
            "[electron] failed to restart the ax-code runtime after a configuration change:",
            error instanceof Error ? error.message : error,
          ),
      )
      .finally(() => {
        inFlight = false
        if (pendingRestart) {
          pendingRestart = false
          requestRestart()
        }
      })
    return true
  }

  return {
    // Returns true when the message was a restart request (consumed).
    handleMessage(msg) {
      if (msg?.type !== "runtime-restart-request") return false
      requestRestart()
      return true
    },
    get inFlight() {
      return inFlight
    },
  }
}

module.exports = { createRuntimeRestartRequestHandler }
