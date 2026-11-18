import { randomUUID } from "node:crypto"
import { DEFAULT_BACKGROUND_RELOAD_TIMEOUT_MS } from "./background-reload.js"

export const createMainRuntimeRestartClient = (parentPort) => {
  if (typeof parentPort?.on !== "function" || typeof parentPort.postMessage !== "function") return null

  const pending = new Map()
  let closed = false

  const finish = (id, error) => {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    clearTimeout(request.timer)
    if (error) request.reject(error)
    else request.resolve()
  }

  parentPort.on("message", (event) => {
    const data = event?.data
    if (data?.type !== "runtime-restart-result") return
    finish(
      data.id,
      data.ok === true ? null : new Error(data.error || "AX Code restart failed in the desktop main process"),
    )
  })
  parentPort.on("close", () => {
    closed = true
    for (const id of pending.keys()) {
      finish(id, new Error("AX Code restart channel closed"))
    }
  })

  return (reason, timeoutMs = DEFAULT_BACKGROUND_RELOAD_TIMEOUT_MS) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error("AX Code restart channel closed"))
        return
      }
      const id = randomUUID()
      const timer = setTimeout(() => finish(id, new Error("Timed out waiting for the desktop runtime restart")), timeoutMs)
      timer.unref()
      pending.set(id, { resolve, reject, timer })
      try {
        parentPort.postMessage({ type: "runtime-restart-request", id, reason })
      } catch (error) {
        finish(id, error instanceof Error ? error : new Error(String(error)))
      }
    })
}
