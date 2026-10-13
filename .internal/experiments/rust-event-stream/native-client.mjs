import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { StringDecoder } from "node:string_decoder"

export const DEFAULT_BINARY = fileURLToPath(
  new URL(
    `../../../.tmp/rust-event-stream-target/release/ax-desktop-event-client-experiment${process.platform === "win32" ? ".exe" : ""}`,
    import.meta.url,
  ),
)
const MAX_BATCH_BYTES = 4 * 1024 * 1024

/** Privileged experimental host API. Configuration goes through stdin, never argv, logs, or renderer IPC. */
export function startRustEventStream({
  endpoint,
  authorization,
  lastEventId = "",
  batchWaitMs = 2,
  signal,
  binary = DEFAULT_BINARY,
}) {
  if (signal?.aborted) throw new Error("Native event stream cancelled")
  const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
  let closed = false
  let spawnFailed = false
  const stats = { stdoutBytes: 0, batches: 0 }
  const completion = new Promise((resolve) => {
    child.once("error", () => {
      spawnFailed = true
    })
    child.once("close", (code) => resolve({ code, spawnFailed }))
  })
  // Do not surface arbitrary subprocess output in application logs or errors.
  child.stderr.resume()
  child.stdin.on("error", () => {})
  const config = JSON.stringify({ endpoint, authorization, lastEventId, batchWaitMs })
  if (Buffer.byteLength(config) > 16384) {
    child.kill()
    throw new Error("Native event stream configuration exceeds limit")
  }
  child.stdin.end(config + "\n")

  async function close() {
    closed = true
    signal?.removeEventListener("abort", abort)
    if (child.exitCode !== null || child.signalCode !== null) return completion
    child.kill()
    let timer
    await Promise.race([
      completion,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 2000)
        timer.unref()
      }),
    ])
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    return completion
  }
  const abort = () => {
    void close()
  }
  signal?.addEventListener("abort", abort, { once: true })
  if (signal?.aborted) abort()

  async function* batches() {
    const decoder = new StringDecoder("utf8")
    let pending = ""
    try {
      for await (const chunk of child.stdout) {
        stats.stdoutBytes += chunk.byteLength
        pending += decoder.write(chunk)
        let end = pending.indexOf("\n")
        while (end !== -1) {
          const line = pending.slice(0, end)
          pending = pending.slice(end + 1)
          if (Buffer.byteLength(line) > MAX_BATCH_BYTES) throw new Error("Native event stream batch exceeds limit")
          if (closed || signal?.aborted) return
          stats.batches++
          // Pull-based consumption keeps only one delivered batch outstanding. A caller may
          // await a renderer ACK before requesting the next batch; stdout then backpressures Rust.
          yield line
          end = pending.indexOf("\n")
        }
        if (Buffer.byteLength(pending) > MAX_BATCH_BYTES) throw new Error("Native event stream batch exceeds limit")
      }
      pending += decoder.end()
      if (!closed && pending.length) throw new Error("Native event stream batch was truncated")
      const result = await completion
      if (!closed && (result.spawnFailed || result.code !== 0)) throw new Error("Native event stream failed")
    } finally {
      await close()
    }
  }
  return { batches: batches(), close, completion, pid: child.pid, stats }
}
