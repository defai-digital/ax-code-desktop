import { parseChatSlashCommand } from "@/components/chat/chatInputSlashCommand"

/**
 * Whether text the user asked to queue may be queued.
 *
 * A command is not a prompt: it runs when it is sent, not when the session falls idle, and the
 * queue's two dispatch paths disagreed about what to do with one — the chip ran it through the
 * command-aware submit while auto-send delivered it to the model as text. Nothing filters a
 * command out of the queue otherwise, and a flush that begins with one clears the rest of the queue
 * and the composer draft before running it.
 */
export const isQueueableMessage = (text: string, inputMode = "normal"): boolean =>
  parseChatSlashCommand(text, inputMode) === null
