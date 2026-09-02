import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"

export type SessionMessageRecord = {
  info: Message
  parts: Part[]
}
