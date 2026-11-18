"use strict"

// Electron main owns the supervised runtime. Requests received during a restart
// are covered by one follow-up that re-resolves the binary from current settings.
function createRuntimeRestartRequestHandler({ getSupervision, logger = console } = {}) {
  if (typeof getSupervision !== "function") {
    throw new TypeError("createRuntimeRestartRequestHandler requires a getSupervision() function")
  }
  let inFlight = false
  let pending = []

  const replyToBatch = (batch, result) => {
    for (const { id, reply } of batch) {
      try {
        reply({ type: "runtime-restart-result", id, ...result })
      } catch (error) {
        logger.error("[electron] failed to reply to a runtime restart request:", error)
      }
    }
  }

  async function run(batch) {
    inFlight = true
    while (batch.length > 0) {
      const supervision = getSupervision()
      if (!supervision) {
        replyToBatch(batch, { ok: false, error: "The desktop main process is not supervising AX Code" })
      } else {
        try {
          await supervision.restart({ reprepare: true })
          logger.log("[electron] ax-code runtime restarted after a configuration change")
          replyToBatch(batch, { ok: true })
        } catch (error) {
          logger.error(
            "[electron] failed to restart the ax-code runtime after a configuration change:",
            error instanceof Error ? error.message : error,
          )
          replyToBatch(batch, { ok: false, error: "AX Code runtime failed to restart in the desktop main process" })
        }
      }
      batch = pending
      pending = []
    }
    inFlight = false
  }

  return {
    handleMessage(msg, reply) {
      if (msg?.type !== "runtime-restart-request") return false
      if (typeof msg.id === "string" && msg.id && typeof reply === "function") {
        const request = { id: msg.id, reply }
        if (inFlight) pending.push(request)
        else void run([request])
      }
      return true
    },
    get inFlight() {
      return inFlight
    },
  }
}

module.exports = { createRuntimeRestartRequestHandler }
