export type PlanSaveQueueEntry = {
  path: string
  content: string
}

/**
 * Whether the editor's content is an edit worth writing back.
 *
 * A load sets the content from disk, and PlanView's autosave effect reacts to every content
 * change — including that one. Without this the plan was written back 350 ms after every read:
 * harmless churn when nothing else touched the file, and an overwrite of whatever the agent
 * wrote to the plan in that window. `loadedContent` is null until a read has succeeded, and
 * then any content counts as an edit.
 */
export const planContentNeedsSave = (content: string, loadedContent: string | null): boolean =>
  loadedContent === null || content !== loadedContent

type PlanSaveQueueOptions = {
  save: (path: string, content: string) => Promise<void>
  isLatestEntry: (entry: PlanSaveQueueEntry) => boolean
  /**
   * Every write that reached the disk, whether or not the editor moved on while it was in flight. The caller
   * records what the disk holds with it; reporting only the latest entry left that record behind whenever a
   * save completed after the content changed again, and a later revert to the older text was then mistaken for
   * "nothing to save".
   */
  onSaved?: (entry: PlanSaveQueueEntry) => void
  onLatestSaved?: (entry: PlanSaveQueueEntry) => void
  onLatestError: (entry: PlanSaveQueueEntry, error: unknown) => void
}

export class PlanSaveQueue {
  private readonly queuedByPath = new Map<string, PlanSaveQueueEntry>()
  private readonly activeByPath = new Map<string, Promise<void>>()

  constructor(private readonly options: PlanSaveQueueOptions) {}

  enqueue(entry: PlanSaveQueueEntry): Promise<void> {
    this.queuedByPath.set(entry.path, entry)

    const active = this.activeByPath.get(entry.path)
    if (active) {
      return active
    }

    const drainPromise = this.drain(entry.path).finally(() => {
      this.activeByPath.delete(entry.path)
      // An enqueue can land after drain returns but before this cleanup runs.
      // Restart it and keep callers joined to the completed drain waiting.
      const pending = this.queuedByPath.get(entry.path)
      if (pending) return this.enqueue(pending)
    })
    this.activeByPath.set(entry.path, drainPromise)
    return drainPromise
  }

  hasPending(path: string): boolean {
    return this.activeByPath.has(path) || this.queuedByPath.has(path)
  }

  private async drain(path: string): Promise<void> {
    while (true) {
      const entry = this.queuedByPath.get(path)
      if (!entry) {
        return
      }

      this.queuedByPath.delete(path)

      try {
        await this.options.save(entry.path, entry.content)
        this.options.onSaved?.(entry)
        if (!this.queuedByPath.has(path) && this.options.isLatestEntry(entry)) {
          this.options.onLatestSaved?.(entry)
        }
      } catch (error) {
        if (!this.queuedByPath.has(path) && this.options.isLatestEntry(entry)) {
          this.options.onLatestError(entry, error)
        }
      }
    }
  }
}
