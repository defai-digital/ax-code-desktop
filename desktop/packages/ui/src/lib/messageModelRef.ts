export interface MessageModelRef {
  agent?: string
  providerID?: string
  modelID?: string
  variant?: string
}

interface MessageModelRefSource {
  model?: { providerID?: string; modelID?: string; variant?: string } | null
  agent?: string
  mode?: string
  variant?: string
}

const nonEmptyText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined

/**
 * Read the model selection recorded on a user message. `agent` falls back to the
 * legacy `mode` field, and `variant` prefers the AX Code 1.4.0 location
 * (`model.variant`) over the legacy top-level one. Every field is undefined when
 * absent or blank.
 */
export const extractMessageModelRef = (message: MessageModelRefSource): MessageModelRef => ({
  agent: nonEmptyText(message.agent) ?? nonEmptyText(message.mode),
  providerID: nonEmptyText(message.model?.providerID),
  modelID: nonEmptyText(message.model?.modelID),
  variant: nonEmptyText(message.model?.variant ?? message.variant),
})
