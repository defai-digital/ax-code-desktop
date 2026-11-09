import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"

import { isDiffParseResponse, type DiffParseRequest } from "./diffParseProtocol"

export type DiffParseWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">
export type DiffParseFailure = "too-large" | "busy" | "error" | "aborted"

export class DiffParseError extends Error {
  constructor(readonly reason: DiffParseFailure) {
    super(`diff parse ${reason}`)
    this.name = "DiffParseError"
  }
}

export const PARSE_TIMEOUT_MS = 15_000
export const MAX_PENDING_CHARACTERS = 32_000_000
export const WORKER_FAILURE_LIMIT = 3

interface Waiter {
  resolve: (diff: FileDiffMetadata) => void
  reject: (error: DiffParseError) => void
  detach: () => void
}

interface Job {
  key: string
  request: DiffParseRequest
  waiters: Set<Waiter>
}

function parseOnThisThread(name: string, original: string, modified: string): FileDiffMetadata {
  return parseDiffFromFile({ name, contents: original }, { name, contents: modified })
}

function jobCharacters(job: Job): number {
  return job.request.original.length + job.request.modified.length
}

/**
 * One Worker, one running job, FIFO queue, same-key requests share a job
 * (SPEC-2026-11-08-diff-parse-worker-v1). A job with no remaining waiter is dropped, and
 * the running one is stopped by terminating the Worker: jsdiff cannot be interrupted.
 */
export class DiffParseClient {
  private worker: DiffParseWorker | null = null
  private active: Job | null = null
  private queue: Job[] = []
  private jobsByKey = new Map<string, Job>()
  private pendingCharacters = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextId = 0
  private failures = 0
  private parseOnThread = false
  private threadTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly createWorker: () => DiffParseWorker,
    private readonly parseSync: typeof parseOnThisThread = parseOnThisThread,
  ) {}

  /** True once the Worker proved unusable; parses then run synchronously, as before this client existed. */
  get usesThreadFallback(): boolean {
    return this.parseOnThread
  }

  parse(key: string, name: string, original: string, modified: string, signal?: AbortSignal): Promise<FileDiffMetadata> {
    if (signal?.aborted) return Promise.reject(new DiffParseError("aborted"))
    if (this.parseOnThread) return this.parseNow(name, original, modified)

    let job = this.jobsByKey.get(key)
    if (!job) {
      const characters = original.length + modified.length
      if (this.pendingCharacters + characters > MAX_PENDING_CHARACTERS) {
        return Promise.reject(new DiffParseError("busy"))
      }
      job = { key, request: { id: ++this.nextId, name, original, modified }, waiters: new Set() }
      this.jobsByKey.set(key, job)
      this.queue.push(job)
      this.pendingCharacters += characters
    }

    const target = job
    const promise = new Promise<FileDiffMetadata>((resolve, reject) => {
      const onAbort = () => {
        waiter.detach()
        target.waiters.delete(waiter)
        reject(new DiffParseError("aborted"))
        if (target.waiters.size === 0) this.drop(target)
      }
      const waiter: Waiter = {
        resolve,
        reject,
        detach: () => signal?.removeEventListener("abort", onAbort),
      }
      target.waiters.add(waiter)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
    this.pump()
    return promise
  }

  dispose(): void {
    if (this.threadTimer !== null) clearTimeout(this.threadTimer)
    this.threadTimer = null
    this.stopWorker()
    const jobs = [...(this.active ? [this.active] : []), ...this.queue]
    this.active = null
    this.queue = []
    for (const job of jobs) this.settle(job, new DiffParseError("aborted"))
  }

  private parseNow(name: string, original: string, modified: string): Promise<FileDiffMetadata> {
    try {
      return Promise.resolve(this.parseSync(name, original, modified))
    } catch {
      return Promise.reject(new DiffParseError("error"))
    }
  }

  private drop(job: Job) {
    if (this.active === job) {
      // jsdiff has no cancellation point; terminating the Worker is the only way to stop it.
      this.stopWorker()
      this.forget(job)
      this.active = null
      this.pump()
      return
    }
    const index = this.queue.indexOf(job)
    if (index >= 0) {
      this.queue.splice(index, 1)
      this.forget(job)
    }
  }

  private forget(job: Job) {
    if (this.jobsByKey.get(job.key) === job) this.jobsByKey.delete(job.key)
    this.pendingCharacters -= jobCharacters(job)
  }

  private settle(job: Job, outcome: FileDiffMetadata | DiffParseError) {
    this.forget(job)
    const waiters = [...job.waiters]
    job.waiters.clear()
    for (const waiter of waiters) {
      waiter.detach()
      if (outcome instanceof DiffParseError) waiter.reject(outcome)
      else waiter.resolve(outcome)
    }
  }

  private stopWorker() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const worker = this.worker
    this.worker = null
    worker?.terminate()
  }

  private finishActive(outcome: FileDiffMetadata | DiffParseError) {
    const job = this.active
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.active = null
    if (job) this.settle(job, outcome)
    this.pump()
  }

  private fail() {
    this.stopWorker()
    this.failures += 1
    if (this.failures >= WORKER_FAILURE_LIMIT) this.switchToThreadFallback()
    this.finishActive(new DiffParseError("error"))
  }

  private switchToThreadFallback() {
    this.parseOnThread = true
  }

  /**
   * Fallback drain: one queued job per task, yielding in between, so the window can paint and an
   * abort for a job the user has left removes it before it runs.
   */
  private scheduleThreadDrain() {
    if (this.threadTimer !== null || this.queue.length === 0) return
    this.threadTimer = setTimeout(() => {
      this.threadTimer = null
      const job = this.queue.shift()
      if (job) {
        const { name, original, modified } = job.request
        try {
          this.settle(job, this.parseSync(name, original, modified))
        } catch {
          this.settle(job, new DiffParseError("error"))
        }
      }
      this.scheduleThreadDrain()
    }, 0)
  }

  private pump() {
    if (this.parseOnThread) {
      this.scheduleThreadDrain()
      return
    }
    if (this.active || this.queue.length === 0) return
    const job = this.queue.shift()
    if (!job) return
    this.active = job

    if (!this.worker) {
      let worker: DiffParseWorker
      try {
        worker = this.createWorker()
      } catch {
        // No Worker in this environment, or the bundle failed to load: keep diffs working on this thread.
        this.active = null
        this.queue.unshift(job)
        this.switchToThreadFallback()
        this.scheduleThreadDrain()
        return
      }
      this.worker = worker
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (this.worker !== worker) return
        const data = event.data
        if (!isDiffParseResponse(data) || data.id !== this.active?.request.id) {
          this.fail()
          return
        }
        if ("error" in data) {
          // The parse itself threw: the Worker is healthy, the input is not diffable.
          this.finishActive(new DiffParseError("error"))
          return
        }
        this.failures = 0
        this.finishActive(data.diff)
      }
      worker.onerror = worker.onmessageerror = () => {
        if (this.worker === worker) this.fail()
      }
    }

    this.timer = setTimeout(() => {
      this.stopWorker()
      this.finishActive(new DiffParseError("too-large"))
    }, PARSE_TIMEOUT_MS)
    try {
      this.worker.postMessage(job.request)
    } catch {
      this.fail()
    }
  }
}

function createDiffParseWorker(): DiffParseWorker {
  if (typeof Worker === "undefined") throw new Error("Worker is unavailable")
  return new Worker(new URL("./diffParse.worker.ts", import.meta.url), { type: "module" })
}

export const diffParseClient = new DiffParseClient(createDiffParseWorker)
