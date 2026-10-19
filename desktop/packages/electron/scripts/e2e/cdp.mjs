// Minimal Chrome DevTools Protocol client for the Desktop end-to-end harness
// (SPEC-2026-10-19-desktop-e2e-harness-v1). It uses Node's built-in fetch and
// WebSocket so the harness adds no dependency.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const listTargets = async (port) => {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
  if (!response.ok) throw new Error(`CDP target list failed with status ${response.status}`)
  const targets = await response.json()
  return Array.isArray(targets) ? targets : []
}

/** The app's main renderer page: a page target that is not DevTools or a guest webview. */
export const isAppPageTarget = (target) =>
  target?.type === "page" &&
  typeof target.url === "string" &&
  !target.url.startsWith("devtools://") &&
  (target.url.startsWith("app://ax-code") || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\//.test(target.url))

export const waitForTarget = async (port, predicate, { timeoutMs = 30_000, intervalMs = 250 } = {}) => {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const match = (await listTargets(port)).find(predicate)
      if (match) return match
    } catch (error) {
      lastError = error
    }
    await sleep(intervalMs)
  }
  throw new Error(`No matching CDP target within ${timeoutMs} ms${lastError ? `: ${lastError.message}` : ""}`)
}

export class CdpSession {
  #socket
  #nextId = 1
  #pending = new Map()
  #listeners = new Map()

  static async connect(webSocketDebuggerUrl, { timeoutMs = 10_000 } = {}) {
    const session = new CdpSession()
    await session.#open(webSocketDebuggerUrl, timeoutMs)
    return session
  }

  #open(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error(`CDP connection to ${url} timed out`))
      }, timeoutMs)
      socket.addEventListener("open", () => {
        clearTimeout(timer)
        this.#socket = socket
        resolve()
      })
      socket.addEventListener("error", () => {
        clearTimeout(timer)
        reject(new Error(`CDP connection to ${url} failed`))
      })
      socket.addEventListener("message", (event) => this.#onMessage(event.data))
      socket.addEventListener("close", () => {
        for (const { reject: rejectPending } of this.#pending.values()) rejectPending(new Error("CDP socket closed"))
        this.#pending.clear()
      })
    })
  }

  #onMessage(raw) {
    let message
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      else pending.resolve(message.result ?? {})
      return
    }
    for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params ?? {})
  }

  send(method, params = {}, { timeoutMs = 15_000 } = {}) {
    if (!this.#socket) return Promise.reject(new Error("CDP session is not connected"))
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`${method} timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      this.#pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? []
    listeners.push(listener)
    this.#listeners.set(method, listeners)
  }

  /** Evaluates an expression in the page and returns its JSON value; page exceptions reject. */
  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true })
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text
      throw new Error(`Page evaluation failed: ${description}`)
    }
    return result.result?.value
  }

  close() {
    this.#socket?.close()
    this.#socket = undefined
  }
}

export const waitForCondition = async (check, { timeoutMs = 20_000, intervalMs = 200, label = "condition" } = {}) => {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await check()
      if (last) return last
    } catch (error) {
      last = error
    }
    await sleep(intervalMs)
  }
  const detail = last instanceof Error ? `: ${last.message}` : ""
  throw new Error(`Timed out waiting for ${label}${detail}`)
}
