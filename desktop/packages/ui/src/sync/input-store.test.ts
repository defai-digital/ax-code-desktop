import { beforeEach, describe, expect, test } from "vitest"
import { useInputStore } from "./input-store"

class MockFileReader {
  result: string | ArrayBuffer | null = null
  onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  onabort: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  error: DOMException | null = null

  readAsDataURL() {
    pendingReaders.push(this)
  }
}

const pendingReaders: MockFileReader[] = []
const originalFileReader = globalThis.FileReader

const restoreFileReader = () => {
  pendingReaders.length = 0
  globalThis.FileReader = originalFileReader
}

const testWithMockFileReader = (name: string, fn: () => Promise<void>) => {
  test(name, async () => {
    try {
      await fn()
    } finally {
      restoreFileReader()
    }
  })
}

const resolveReader = (reader: MockFileReader, result: string) => {
  reader.result = result
  reader.onload?.call(reader as unknown as FileReader, {} as ProgressEvent<FileReader>)
}

const rejectReader = (reader: MockFileReader) => {
  reader.error = new DOMException("read failed", "NotReadableError")
  reader.onerror?.call(reader as unknown as FileReader, {} as ProgressEvent<FileReader>)
}

describe("input-store attachments", () => {
  beforeEach(() => {
    pendingReaders.length = 0
    globalThis.FileReader = MockFileReader as unknown as typeof FileReader
    useInputStore.setState({
      pendingInputText: null,
      pendingInputMode: "replace",
      pendingSyntheticParts: null,
    })
    useInputStore.getState().setAttachedFiles([])
  })

  testWithMockFileReader(
    "does not attach a local file that finishes reading after attachments are cleared",
    async () => {
      const addPromise = useInputStore
        .getState()
        .addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
      expect(pendingReaders).toHaveLength(1)

      useInputStore.getState().clearAttachedFiles()
      resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
      await addPromise

      expect(useInputStore.getState().attachedFiles).toEqual([])
    },
  )

  testWithMockFileReader("does not attach a local file after attached files are replaced", async () => {
    const addPromise = useInputStore
      .getState()
      .addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    useInputStore.getState().setAttachedFiles([])
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader("does not attach a local file after attached files are restored", async () => {
    const addPromise = useInputStore
      .getState()
      .addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    const restored = new File(["restored"], "restored.txt", { type: "text/plain" })
    useInputStore.getState().setAttachedFiles([
      {
        id: "restored",
        file: restored,
        dataUrl: "data:text/plain;base64,cmVzdG9yZWQ=",
        mimeType: "text/plain",
        filename: "restored.txt",
        size: restored.size,
        source: "local",
      },
    ])
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles.map((file) => file.filename)).toEqual(["restored.txt"])
  })

  testWithMockFileReader("drops the stash of a removed draft and discards a read still in flight for it", async () => {
    const store = useInputStore.getState()
    store.setActiveAttachmentDraft("removed")
    const addPromise = store.addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    store.setActiveAttachmentDraft("other")
    expect(useInputStore.getState().attachmentsByDraft).toHaveProperty("removed")

    useInputStore.getState().clearSessionDrafts(["removed"])
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachmentsByDraft).not.toHaveProperty("removed")
  })

  testWithMockFileReader("a removed active draft empties the composer and discards its pending read", async () => {
    const store = useInputStore.getState()
    store.setActiveAttachmentDraft("removed")
    const addPromise = store.addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))

    useInputStore.getState().clearSessionDrafts(["removed"])
    resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  test("clearing drafts for sessions without a draft changes nothing", () => {
    const before = useInputStore.getState()
    before.clearSessionDrafts(["unknown"])
    expect(useInputStore.getState().attachmentsByDraft).toBe(before.attachmentsByDraft)
    expect(useInputStore.getState().attachedFiles).toBe(before.attachedFiles)
  })

  test("does not leave local file reads pending after a reader error", async () => {
    const addPromise = useInputStore
      .getState()
      .addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
    expect(pendingReaders).toHaveLength(1)

    rejectReader(pendingReaders[0])
    await addPromise

    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  testWithMockFileReader(
    "keeps a file that finishes reading after the composer moved to another draft",
    async () => {
      // Switching drafts while a file was still being read dropped it: it was not in the list the
      // switch stashed (that list is the one from before the read finished) and the generation check
      // returned without putting it anywhere.
      useInputStore.getState().setActiveAttachmentDraft("ses_a")
      const addPromise = useInputStore
        .getState()
        .addAttachedFile(new File(["hello"], "hello.txt", { type: "text/plain" }))
      expect(pendingReaders).toHaveLength(1)

      useInputStore.getState().setActiveAttachmentDraft("ses_b")
      resolveReader(pendingReaders[0], "data:text/plain;base64,aGVsbG8=")
      await addPromise

      // Not in the draft on screen…
      expect(useInputStore.getState().attachedFiles).toEqual([])

      // …and still in the draft it was added to.
      useInputStore.getState().setActiveAttachmentDraft("ses_a")
      expect(useInputStore.getState().attachedFiles.map((file) => file.filename)).toEqual(["hello.txt"])
    },
  )

  test("keeps attached files with the draft they were added to", () => {
    // The composer is not remounted on a session switch, so a single shared list showed one
    // session's chips in another's composer and sent those files with its prompt.
    const file = {
      id: "f1",
      file: new File([], "notes.png", { type: "image/png" }),
      filename: "notes.png",
      mimeType: "image/png",
      size: 3,
      dataUrl: "data:,x",
      source: "local" as const,
    }

    useInputStore.getState().setActiveAttachmentDraft("ses_a")
    useInputStore.getState().setAttachedFiles([file])

    useInputStore.getState().setActiveAttachmentDraft("ses_b")
    expect(useInputStore.getState().attachedFiles).toEqual([])

    useInputStore.getState().setActiveAttachmentDraft("ses_a")
    expect(useInputStore.getState().attachedFiles).toEqual([file])
  })

  test("does not restore files that were sent from their draft", () => {
    const file = {
      id: "f1",
      file: new File([], "notes.png", { type: "image/png" }),
      filename: "notes.png",
      mimeType: "image/png",
      size: 3,
      dataUrl: "data:,x",
      source: "local" as const,
    }

    useInputStore.getState().setActiveAttachmentDraft("ses_a")
    useInputStore.getState().setAttachedFiles([file])
    useInputStore.getState().clearAttachedFiles()

    useInputStore.getState().setActiveAttachmentDraft("ses_b")
    useInputStore.getState().setActiveAttachmentDraft("ses_a")
    expect(useInputStore.getState().attachedFiles).toEqual([])
  })

  test("adds MCP resource attachments without reading local files", () => {
    useInputStore.getState().addMcpResourceAttachment({
      client: "docs",
      name: "readme",
      uri: "mcp://docs/readme.md",
      mimeType: "text/markdown",
    })

    expect(pendingReaders).toHaveLength(0)
    expect(useInputStore.getState().attachedFiles).toMatchObject([
      {
        dataUrl: "mcp://docs/readme.md",
        filename: "readme",
        mimeType: "text/markdown",
        source: "mcp-resource",
        resource: {
          clientName: "docs",
          uri: "mcp://docs/readme.md",
        },
      },
    ])
  })
})
