import { createMarkdownWorkerResponder } from "./markdownWorkerParser"
import {
  MAX_WORKER_MARKDOWN_CHARACTERS,
  type MarkdownParseRequest,
  type MarkdownParseResponse,
} from "./markdownWorkerProtocol"

const parseMarkdownInWorker = createMarkdownWorkerResponder()

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MarkdownParseRequest>) => void) | null
  postMessage: (response: MarkdownParseResponse) => void
}

// Dedicated-worker messages arrive on an implicit MessagePort. The HTML
// spec leaves event.origin empty, so comparing it with location.origin
// would drop every parse and disable this worker after the client timeout.
scope.onmessage = ({ data }) => {
  try {
    if (data.text.length > MAX_WORKER_MARKDOWN_CHARACTERS) throw new Error("Markdown exceeds worker limit")
    scope.postMessage(parseMarkdownInWorker(data))
  } catch {
    scope.postMessage({ id: data.id, blocks: null })
  }
}
