export function waitForDevRenderer(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Timed out waiting for Vite to bind its renderer port")), timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      child.off("message", onMessage)
      child.off("error", onError)
      child.off("exit", onExit)
    }
    const finish = (error, url) => {
      cleanup()
      if (error) reject(error)
      else resolve(url)
    }
    const onMessage = (message) => {
      if (message?.type !== "renderer-ready") return
      if (!Number.isInteger(message.port) || message.port < 1 || message.port > 65535) {
        finish(new Error("Vite reported an invalid renderer port"))
        return
      }
      finish(null, `http://127.0.0.1:${message.port}`)
    }
    const onError = (error) => finish(error)
    const onExit = (code, signal) => finish(new Error(`Vite exited before renderer readiness with ${signal || code}`))
    child.on("message", onMessage)
    child.once("error", onError)
    child.once("exit", onExit)
  })
}
