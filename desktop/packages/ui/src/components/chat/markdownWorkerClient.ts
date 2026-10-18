import {
  MAX_WORKER_MARKDOWN_CHARACTERS,
  type MarkdownParseRequest,
  type MarkdownParseResponse,
  type ParsedMarkdownBlock,
} from "./markdownWorkerProtocol"

type ResultHandler = (blocks: ParsedMarkdownBlock[] | null) => void
type Job = { owner: object; request: MarkdownParseRequest; result: ResultHandler; released?: boolean }
export type MarkdownWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">
export type MarkdownAdmission = "queued" | "deferred" | "rejected"

const MAX_PENDING_JOBS = 16
const MAX_RETAINED_CHARACTERS = 4_000_000
const TIMEOUT_MS = 5_000
const FAILURE_LIMIT = 3
const RECOVERY_COOLDOWN_MS = 15_000

// One active job, one latest pending job per owner, and one acknowledged
// response. Deferred consumers retain their source in React, not in this queue.
export class MarkdownWorkerClient {
  private worker: MarkdownWorker | null = null
  private active: Job | null = null
  private pending = new Map<object, Job>()
  private pendingCharacters = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null
  private nextId = 0
  private nextOwnerId = 0
  private ownerIds = new WeakMap<object, number>()
  private failures = 0
  private retryAt = 0
  private capacityListeners = new Set<() => void>()
  private capacityNotificationPending = false
  private response: { owner: object; id: number; baseKey: string; blocks: ParsedMarkdownBlock[] } | null = null

  constructor(private readonly createWorker: () => MarkdownWorker) {}

  request(owner: object, input: Omit<MarkdownParseRequest, "id">, result: ResultHandler): MarkdownAdmission {
    const previous = this.pending.get(owner)
    if (input.text.length > MAX_WORKER_MARKDOWN_CHARACTERS) {
      this.removePending(owner)
      this.deliver({ owner, request: { ...input, id: 0 }, result }, null)
      this.notifyCapacity()
      return "rejected"
    }
    const retained =
      this.pendingCharacters - (previous?.request.text.length ?? 0) + (this.active?.request.text.length ?? 0)
    if (
      Date.now() < this.retryAt ||
      (!previous && this.pending.size >= MAX_PENDING_JOBS) ||
      retained + input.text.length > MAX_RETAINED_CHARACTERS
    ) {
      this.removePending(owner)
      this.deliver({ owner, request: { ...input, id: 0 }, result }, null)
      if (previous) this.notifyCapacity()
      return "deferred"
    }
    let ownerId = this.ownerIds.get(owner)
    if (ownerId === undefined) this.ownerIds.set(owner, (ownerId = ++this.nextOwnerId))
    this.pendingCharacters += input.text.length - (previous?.request.text.length ?? 0)
    // Replacing a pending value keeps its queue position, preventing a rapidly
    // changing owner from being moved behind every newly mounted consumer.
    this.pending.set(owner, { owner, request: { ...input, ownerId, id: ++this.nextId }, result })
    this.pump()
    return "queued"
  }

  subscribeCapacity(listener: () => void): () => void {
    this.capacityListeners.add(listener)
    return () => {
      this.capacityListeners.delete(listener)
    }
  }

  release(owner: object) {
    this.removePending(owner)
    if (this.response?.owner === owner) this.response = null
    if (this.active?.owner === owner) this.active.released = true
    if (this.pending.size === 0 && (!this.active || this.active.released)) this.dispose()
    this.notifyCapacity()
  }

  private removePending(owner: object) {
    const previous = this.pending.get(owner)
    if (previous) this.pendingCharacters -= previous.request.text.length
    this.pending.delete(owner)
  }

  private notifyCapacity() {
    if (this.capacityNotificationPending) return
    this.capacityNotificationPending = true
    queueMicrotask(() => {
      this.capacityNotificationPending = false
      for (const listener of [...this.capacityListeners]) {
        try {
          listener()
        } catch (error) {
          console.error("[markdown-worker] capacity listener failed", error)
        }
      }
    })
  }

  private deliver(job: Job, blocks: ParsedMarkdownBlock[] | null) {
    if (job.released) return
    try {
      job.result(blocks)
    } catch (error) {
      console.error("[markdown-worker] result handler failed", error)
    }
  }

  private dispose() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.worker?.terminate()
    this.worker = null
    this.active = null
    this.response = null
  }

  private fail() {
    const failed = this.active
    this.dispose()
    this.failures++
    if (this.failures >= FAILURE_LIMIT) {
      this.retryAt = Date.now() + RECOVERY_COOLDOWN_MS
      if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer)
      this.recoveryTimer = setTimeout(() => {
        this.recoveryTimer = null
        this.retryAt = 0
        this.pump()
        this.notifyCapacity()
      }, RECOVERY_COOLDOWN_MS)
    }
    // A poison job is settled once, never automatically retried. Other owners
    // remain queued and can use a fresh worker; repeated faults pause spawning.
    if (failed) this.deliver(failed, null)
    if (Date.now() >= this.retryAt) this.pump()
    this.notifyCapacity()
  }

  private complete(data: MarkdownParseResponse) {
    const completed = this.active
    if (!completed || data.id !== completed.request.id) return
    const prefix = data.stablePrefixCount ?? 0
    if (
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      (prefix > 0 &&
        (!data.blocks ||
          !this.response ||
          this.response.owner !== completed.owner ||
          this.response.baseKey !== completed.request.baseKey ||
          this.response.id !== data.baseRevision ||
          prefix > this.response.blocks.length))
    ) {
      this.fail()
      return
    }
    const blocks = data.blocks && prefix ? [...this.response!.blocks.slice(0, prefix), ...data.blocks] : data.blocks
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.active = null
    this.failures = 0
    this.response =
      blocks && completed.request.live && !completed.released
        ? { owner: completed.owner, id: data.id, baseKey: completed.request.baseKey, blocks }
        : null
    this.deliver(completed, blocks)
    this.pump()
    this.notifyCapacity()
  }

  private pump() {
    if (this.active || this.pending.size === 0 || Date.now() < this.retryAt) return
    const job = this.pending.values().next().value!
    this.removePending(job.owner)
    this.active = job
    try {
      if (!this.worker) {
        const worker = this.createWorker()
        this.worker = worker
        worker.onmessage = (event: MessageEvent<MarkdownParseResponse>) => {
          if (this.worker === worker) this.complete(event.data)
        }
        worker.onerror = worker.onmessageerror = () => {
          if (this.worker === worker) this.fail()
        }
      }
      const baseRevision = this.response?.owner === job.owner ? this.response.id : undefined
      this.timer = setTimeout(() => this.fail(), TIMEOUT_MS)
      this.worker.postMessage({ ...job.request, baseRevision })
    } catch {
      this.fail()
    }
  }
}

export const markdownWorkerClient = new MarkdownWorkerClient(
  () => new Worker(new URL("./markdownParser.worker.ts", import.meta.url), { type: "module" }),
)
