/** A bounded host-to-renderer window. Out-of-order ACKs cannot advance a recovery checkpoint. */
export class NativeBatchWindow {
  #pending = new Map()
  #next = 0
  #acknowledged = 0
  #bytes = 0
  #closed = false
  #cursor = ""

  get cursor() {
    return this.#cursor
  }
  get pendingCount() {
    return this.#pending.size
  }
  get pendingBytes() {
    return this.#bytes
  }

  async send(batch, bytes, deliver) {
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 4 * 1024 * 1024)
      throw new Error("Invalid native batch size")
    while (this.#pending.size >= 8 || this.#bytes + bytes > 4 * 1024 * 1024) {
      if (this.#closed) throw new Error("Native window closed")
      await Promise.race(
        Array.from(this.#pending.values())
          .filter((entry) => !entry.acknowledged)
          .map((entry) => entry.promise),
      )
    }
    if (this.#closed) throw new Error("Native window closed")
    const sequence = ++this.#next
    let resolve
    const promise = new Promise((done) => {
      resolve = done
    })
    this.#pending.set(sequence, { cursor: batch.cursor, bytes, promise, resolve, acknowledged: false })
    this.#bytes += bytes
    deliver(sequence, batch)
    return sequence
  }

  acknowledge(sequence, cursor) {
    const entry = this.#pending.get(sequence)
    if (!entry || entry.cursor !== cursor) return false
    entry.acknowledged = true
    entry.resolve()
    while (this.#pending.get(this.#acknowledged + 1)?.acknowledged) {
      const complete = this.#pending.get(++this.#acknowledged)
      this.#cursor = complete.cursor
      this.#bytes -= complete.bytes
      this.#pending.delete(this.#acknowledged)
    }
    return true
  }

  close() {
    this.#closed = true
    for (const entry of this.#pending.values()) entry.resolve()
    this.#pending.clear()
    this.#bytes = 0
  }
}
