import type { Message } from "@defai-digital/ax-code-sdk/v2"

// The id containers below are keyed by message id and live for the process lifetime, so a session
// that browses many messages would grow them without bound. Keep the newest entries only (the same
// order of magnitude as the other render caches in this app). Evicting is safe: a dropped id is
// re-evaluated on the next render, and an old message is never fresh again.
const MAX_TRACKED_MESSAGE_IDS = 5000

export class MessageFreshnessDetector {
  private static instance: MessageFreshnessDetector
  private sessionStartTimes: Map<string, number> = new Map()
  private seenMessageIds: Set<string> = new Set()
  private messageCreationTimes: Map<string, number> = new Map()

  private constructor() {}

  private trackMessage(messageId: string, createdTime: number): void {
    this.seenMessageIds.add(messageId)
    this.messageCreationTimes.set(messageId, createdTime)

    if (this.seenMessageIds.size <= MAX_TRACKED_MESSAGE_IDS) {
      return
    }

    // A Set keeps insertion order, so the first key is the oldest surviving id.
    const oldest = this.seenMessageIds.keys().next().value
    if (oldest !== undefined) {
      this.seenMessageIds.delete(oldest)
      this.messageCreationTimes.delete(oldest)
    }
  }

  static getInstance(): MessageFreshnessDetector {
    if (!MessageFreshnessDetector.instance) {
      MessageFreshnessDetector.instance = new MessageFreshnessDetector()
    }
    return MessageFreshnessDetector.instance
  }

  recordSessionStart(sessionId: string): void {
    this.sessionStartTimes.set(sessionId, Date.now())
  }

  getSessionStartTime(sessionId: string): number | undefined {
    return this.sessionStartTimes.get(sessionId)
  }

  shouldAnimateMessage(message: Message, sessionId: string): boolean {
    if (message.role !== "assistant") {
      return false
    }

    if (this.seenMessageIds.has(message.id)) {
      return false
    }

    const sessionStartTime = this.sessionStartTimes.get(sessionId)

    if (!sessionStartTime) {
      this.trackMessage(message.id, message.time.created)
      return false
    }

    const isFresh = message.time.created > sessionStartTime - 5000

    // Record fresh messages too so each animates at most once: the detector is a
    // module singleton that outlives ChatViewport remounts, so an unrecorded id is
    // re-evaluated against the stale session start time and replays the animation.
    this.trackMessage(message.id, message.time.created)

    return isFresh
  }

  clearSession(sessionId: string): void {
    this.sessionStartTimes.delete(sessionId)
  }

  hasSessionTiming(sessionId: string): boolean {
    return this.sessionStartTimes.has(sessionId)
  }

  hasBeenAnimated(messageId: string): boolean {
    return this.seenMessageIds.has(messageId)
  }

  markMessageAsAnimated(messageId: string, createdTime: number): void {
    this.trackMessage(messageId, createdTime)
  }

  clearAll(): void {
    this.sessionStartTimes.clear()
    this.seenMessageIds.clear()
    this.messageCreationTimes.clear()
  }

  getDebugInfo(): {
    sessionStartTimes: Map<string, number>
    seenMessageIds: Set<string>
    messageCreationTimes: Map<string, number>
  } {
    return {
      sessionStartTimes: new Map(this.sessionStartTimes),
      seenMessageIds: new Set(this.seenMessageIds),
      messageCreationTimes: new Map(this.messageCreationTimes),
    }
  }
}
