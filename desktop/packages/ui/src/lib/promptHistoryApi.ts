import { axCodeClient } from "@/lib/ax-code/client"
import { buildAxCodeApiUrl } from "@/lib/ax-code/baseUrl"
import { API_ENDPOINTS, HTTP_DEFAULTS } from "@/lib/http"
import {
  PROMPT_HISTORY_LIMIT,
  parsePromptHistoryList,
  type PromptRecallEntry,
} from "@/lib/promptHistoryRecall"

const DIRECTORY_HEADER = "x-ax-code-directory"
const LEGACY_DIRECTORY_HEADER = "x-opencode-directory"

const appendChains = new Map<string, Promise<void>>()

export type PromptHistoryListResult = { ok: true; entries: PromptRecallEntry[] } | { ok: false }

export function resetPromptHistoryTransportForTests() {
  appendChains.clear()
}

export function promptHistoryRequestUrl(baseUrl: string, directory: string, limit?: number): string {
  const path = buildAxCodeApiUrl(baseUrl, API_ENDPOINTS.promptHistory.base)
  const params = new URLSearchParams()
  params.set("directory", directory)
  if (limit !== undefined) params.set("limit", String(limit))
  const joiner = path.includes("?") ? "&" : "?"
  return `${path}${joiner}${params.toString()}`
}

const headerNeedsEncoding = (directory: string) => {
  for (let index = 0; index < directory.length; index += 1) {
    if (directory.charCodeAt(index) > 127) return true
  }
  return false
}

export function promptHistoryHeaders(directory: string, extra?: Record<string, string>): Record<string, string> {
  const encoded = headerNeedsEncoding(directory) ? encodeURIComponent(directory) : directory
  return {
    ...extra,
    [DIRECTORY_HEADER]: encoded,
    [LEGACY_DIRECTORY_HEADER]: encoded,
  }
}

export async function listPromptHistory(directory: string): Promise<PromptHistoryListResult> {
  if (!directory) return { ok: false }
  try {
    const response = await fetch(promptHistoryRequestUrl(axCodeClient.getBaseUrl(), directory, PROMPT_HISTORY_LIMIT), {
      method: HTTP_DEFAULTS.method.get,
      headers: promptHistoryHeaders(directory, { ...HTTP_DEFAULTS.headers.acceptJson }),
    })
    if (!response.ok) return { ok: false }
    const parsed = parsePromptHistoryList(await response.json())
    if (!parsed) return { ok: false }
    return { ok: true, entries: parsed }
  } catch {
    return { ok: false }
  }
}

async function postPromptHistory(directory: string, entry: PromptRecallEntry): Promise<void> {
  await fetch(promptHistoryRequestUrl(axCodeClient.getBaseUrl(), directory), {
    method: HTTP_DEFAULTS.method.post,
    headers: promptHistoryHeaders(directory, { ...HTTP_DEFAULTS.headers.acceptAndContentTypeJson }),
    body: JSON.stringify({
      input: entry.input,
      ...(entry.mode ? { mode: entry.mode } : {}),
      parts: entry.parts,
    }),
  })
}

/** One directory's writes stay in submit order. A failed write does not block the next one. */
export function appendPromptHistory(directory: string, entry: PromptRecallEntry): Promise<void> {
  if (!directory || entry.input.length === 0) return Promise.resolve()
  const previous = appendChains.get(directory) ?? Promise.resolve()
  const run = previous.then(() => postPromptHistory(directory, entry))
  appendChains.set(
    directory,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run.then(
    () => undefined,
    () => undefined,
  )
}
