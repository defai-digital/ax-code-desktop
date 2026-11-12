"use strict"

// Ask the server to shut down gracefully (which also stops the ax-code child it
// spawned), then ensure the process is gone. A wedged server may ignore the
// graceful stop and even SIGTERM, so escalate to SIGKILL rather than hang the
// quit path forever. Resolves once the child exits or a kill is sent.
function gracefulStopServerProcess(child, { termTimeoutMs, killTimeoutMs }, options = {}) {
  return new Promise((resolve) => {
    let done = false
    let termTimer = null
    let killTimer = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(termTimer)
      if (killTimer) clearTimeout(killTimer)
      child.removeListener("exit", finish)
      resolve()
    }
    const terminate = () => {
      clearTimeout(termTimer)
      if (done) return
      killTimer = setTimeout(() => {
        forceStopUtilityProcess(child, options)
        finish()
      }, killTimeoutMs)
      try {
        child.kill()
      } catch {
        // A disconnected handle can still own a process; retain the force-stop timer.
      }
    }
    termTimer = setTimeout(terminate, termTimeoutMs)
    child.once("exit", finish)
    try {
      child.postMessage({ type: "stop" })
    } catch {
      terminate()
    }
  })
}

function forceStopUtilityProcess(child, { killProcess = process.kill, logger = console } = {}) {
  try {
    // Electron 46's kill() only sends SIGTERM and accepts no signal argument.
    // Read the current handle's PID at dispatch time, never a previously captured PID.
    const pid = child.pid
    if (!Number.isInteger(pid) || pid <= 0) return child.kill()
    killProcess(pid, "SIGKILL")
    return true
  } catch (error) {
    if (error?.code !== "ESRCH") logger.warn("[electron] failed to force-stop the server utility process")
    return false
  }
}

module.exports = { gracefulStopServerProcess, forceStopUtilityProcess }
