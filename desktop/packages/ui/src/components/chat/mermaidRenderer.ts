import { sanitizeMermaidSvg } from "./sanitizeSvg"
import {
  getMermaidCapability,
  mermaidCapabilities,
  MermaidRenderError,
  type MermaidRequest,
  type MermaidWorkerResponse,
} from "./mermaidProtocol"

type Job = {
  request: MermaidRequest
  signal: AbortSignal
  resolve: (output: string) => void
  reject: (error: unknown) => void
}

// One active layout bounds CPU/memory, preserves Mermaid's global configuration,
// and avoids creating one worker for every diagram in a long transcript.
export function createMermaidRenderer({
  createWorker = () => new Worker(new URL("./mermaidRenderer.worker.ts", import.meta.url), { type: "module" }),
  renderOfficial = async (request, signal) =>
    (await import("./mermaidOfficialRenderer")).renderOfficialMermaid(request, signal),
  timeoutMs = mermaidCapabilities.workerTimeoutMs,
}: {
  createWorker?: () => Worker
  renderOfficial?: (request: MermaidRequest, signal: AbortSignal) => Promise<string>
  timeoutMs?: number
} = {}) {
  const queue: Job[] = []
  const cache = new Map<string, string>()
  let cacheCharacters = 0
  let active = false
  let worker: Worker | undefined
  let sequence = 0
  let officialPending = false

  function inWorker(request: MermaidRequest, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        worker ??= createWorker()
      } catch {
        reject(new MermaidRenderError("unavailable"))
        return
      }
      const current = worker
      const id = ++sequence
      const finish = (error?: unknown, output?: string, terminate = false) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        current.onmessage = null
        current.onerror = null
        current.onmessageerror = null
        if (terminate) {
          current.terminate()
          worker = undefined
        }
        if (error) reject(error)
        else resolve(output ?? "")
      }
      const abort = () => finish(signal.reason, undefined, true)
      const timer = setTimeout(() => finish(new MermaidRenderError("timeout"), undefined, true), timeoutMs)
      signal.addEventListener("abort", abort, { once: true })
      current.onmessage = ({ data }: MessageEvent<MermaidWorkerResponse>) => {
        if (data.id !== id) return
        if (data.error)
          finish(
            new MermaidRenderError(data.errorCode ?? "render", data.error),
            undefined,
            data.errorCode === "unavailable",
          )
        else if (typeof data.output === "string" && data.output.length > 0) finish(undefined, data.output)
        else finish(new MermaidRenderError("render"))
      }
      current.onerror = () => finish(new MermaidRenderError("unavailable"), undefined, true)
      current.onmessageerror = () => finish(new MermaidRenderError("unavailable"), undefined, true)
      try {
        current.postMessage({ id, request })
      } catch {
        finish(new MermaidRenderError("unavailable"), undefined, true)
      }
    })
  }

  function inOfficial(request: MermaidRequest, signal: AbortSignal): Promise<string> {
    // A deadline can release the queue, but cannot terminate DOM-dependent work.
    // Do not overlap global Mermaid configuration until that work really settles.
    if (officialPending) return Promise.reject(new MermaidRenderError("unavailable"))
    officialPending = true
    const controller = new AbortController()
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (error?: unknown, output?: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        if (error) reject(error)
        else resolve(output ?? "")
      }
      const abort = () => {
        controller.abort(signal.reason)
        finish(signal.reason)
      }
      const timer = setTimeout(() => {
        const error = new MermaidRenderError("timeout")
        controller.abort(error)
        finish(error)
      }, timeoutMs)
      signal.addEventListener("abort", abort, { once: true })
      let operation: Promise<string>
      try {
        operation = renderOfficial(request, controller.signal)
      } catch (error) {
        officialPending = false
        finish(error)
        return
      }
      void operation.then(
        (output) => {
          officialPending = false
          finish(undefined, output)
        },
        (error) => {
          officialPending = false
          finish(error)
        },
      )
    })
  }

  async function drain() {
    if (active) return
    active = true
    try {
      while (queue.length) {
        const job = queue.shift()!
        try {
          job.signal.throwIfAborted()
          const capability = getMermaidCapability(job.request.source, job.request.mode)
          const key = JSON.stringify(job.request)
          let output = cache.get(key)
          if (output === undefined) {
            output =
              capability.renderer === "beautiful-mermaid"
                ? await inWorker(job.request, job.signal)
                : await inOfficial(job.request, job.signal)
            job.signal.throwIfAborted()
            if (job.request.mode === "svg") output = sanitizeMermaidSvg(output)
            if (!output || (job.request.mode === "svg" && !output.includes("<svg")))
              throw new MermaidRenderError("render")
            // Bound cache by source plus output, not only entry count.
            if (key.length + output.length <= 1_000_000) {
              cache.set(key, output)
              cacheCharacters += key.length + output.length
              while (cache.size > 32 || cacheCharacters > 2_000_000) {
                const oldest = cache.keys().next().value!
                cacheCharacters -= oldest.length + cache.get(oldest)!.length
                cache.delete(oldest)
              }
            }
          }
          job.signal.throwIfAborted()
          job.resolve(output)
        } catch (error) {
          job.reject(error)
        }
      }
    } finally {
      active = false
    }
  }

  return (request: MermaidRequest, signal: AbortSignal): Promise<string> => {
    if (signal.aborted) return Promise.reject(signal.reason)
    if (queue.length >= 32) return Promise.reject(new MermaidRenderError("busy"))
    return new Promise((resolve, reject) => {
      const job = { request, signal, resolve, reject }
      // Remove obsolete streaming/theme/unmounted jobs before they consume layout time.
      const abort = () => {
        const index = queue.indexOf(job)
        if (index >= 0) queue.splice(index, 1)
        reject(signal.reason)
      }
      signal.addEventListener("abort", abort, { once: true })
      job.resolve = (output) => {
        signal.removeEventListener("abort", abort)
        resolve(output)
      }
      job.reject = (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      }
      queue.push(job)
      void drain()
    })
  }
}

export const renderMermaidDiagram = createMermaidRenderer()
