"use strict"

function createQuitCoordinator({ onStarting, playEnding, stopServices, quit, logger = console }) {
  let state = "idle"
  let completion
  function handle(event) {
    if (state === "ready") return completion
    event.preventDefault()
    if (state === "waiting") return completion
    state = "waiting"
    onStarting()
    // Both operations start immediately. Media never delays runtime cleanup,
    // and a media failure never prevents cleanup or final exit.
    completion = Promise.allSettled([Promise.resolve().then(playEnding), Promise.resolve().then(stopServices)]).then(
      (results) => {
        for (const result of results)
          if (result.status === "rejected") logger.warn("[electron] quit step failed", result.reason)
        state = "ready"
        quit()
      },
    )
    return completion
  }
  return {
    handle,
    get state() {
      return state
    },
  }
}
module.exports = { createQuitCoordinator }
