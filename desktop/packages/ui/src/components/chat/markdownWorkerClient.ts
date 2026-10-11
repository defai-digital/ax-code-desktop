import {
  MAX_WORKER_MARKDOWN_CHARACTERS,
  type MarkdownParseRequest,
  type MarkdownParseResponse,
  type ParsedMarkdownBlock,
} from "./markdownWorkerProtocol"

type ResultHandler = (blocks: ParsedMarkdownBlock[] | null) => void
type Job = { owner: object; request: MarkdownParseRequest; result: ResultHandler }
export type MarkdownWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">

const MAX_PENDING_JOBS = 16
const MAX_PENDING_CHARACTERS = 4_000_000
const TIMEOUT_MS = 5_000

// One running job and one latest pending job per consumer keep streaming deltas
// from building an unbounded cross-thread queue. No transcript cache is retained.
export class MarkdownWorkerClient {
  private worker: MarkdownWorker | null = null
  private active: Job | null = null
  private pending = new Map<object, Job>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextId = 0
  private disabled = false

  constructor(private readonly createWorker: () => MarkdownWorker) {}

  request(owner: object, input: Omit<MarkdownParseRequest, "id">, result: ResultHandler) {
    this.pending.delete(owner)
    const queuedCharacters = Array.from(this.pending.values()).reduce(
      (total, job) => total + job.request.text.length,
      0,
    )
    if (
      this.disabled ||
      input.text.length > MAX_WORKER_MARKDOWN_CHARACTERS ||
      this.pending.size >= MAX_PENDING_JOBS ||
      queuedCharacters + input.text.length > MAX_PENDING_CHARACTERS
    ) {
      result(null)
      return
    }
    this.pending.set(owner, { owner, request: { ...input, id: ++this.nextId }, result })
    this.pump()
  }

  release(owner: object) {
    this.pending.delete(owner)
    if (this.active?.owner === owner) this.active.result = () => {}
    // Do not cancel another consumer's work. A released active job still has a
    // timeout, so a stuck parser cannot block newly mounted consumers forever.
    if (this.pending.size === 0 && (!this.active || this.active.owner === owner)) {
      this.dispose()
    }
  }

  private dispose() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.worker?.terminate()
    this.worker = null
    this.active = null
  }

  private fail() {
    this.disabled = true
    const jobs = [...this.pending.values()]
    if (this.active) jobs.unshift(this.active)
    this.pending.clear()
    this.dispose()
    jobs.forEach((job) => job.result(null))
  }

  private pump() {
    if (this.active || this.pending.size === 0) return
    try {
      if (!this.worker) {
        const worker = this.createWorker()
        this.worker = worker
        worker.onmessage = (event: MessageEvent<MarkdownParseResponse>) => {
          if (this.worker !== worker || event.data.id !== this.active?.request.id) return
          const completed = this.active
          if (this.timer !== null) clearTimeout(this.timer)
          this.timer = null
          this.active = null
          completed.result(event.data.blocks)
          this.pump()
        }
        worker.onerror = () => {
          if (this.worker === worker) this.fail()
        }
        worker.onmessageerror = () => {
          if (this.worker === worker) this.fail()
        }
      }
      const job = this.pending.values().next().value as Job
      this.pending.delete(job.owner)
      this.active = job
      this.timer = setTimeout(() => this.fail(), TIMEOUT_MS)
      this.worker.postMessage(job.request)
    } catch {
      this.fail()
    }
  }
}

export const markdownWorkerClient = new MarkdownWorkerClient(
  () => new Worker(new URL("./markdownParser.worker.ts", import.meta.url), { type: "module" }),
)
