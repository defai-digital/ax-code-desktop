import { serializeEditorContent, type FileLineEnding } from "./filesViewEditorContent"

type FilesViewDraftWrite = (
  path: string,
  content: string,
  options?: { allowOutsideWorkspace?: boolean; directory?: string },
) => Promise<{ success?: boolean } | null | undefined>

const prepareFilesViewDraft = (
  draftContent: string,
  displayedContent: string,
  lineEnding: FileLineEnding,
): { dirty: boolean; contentToWrite: string } => {
  const contentToWrite = serializeEditorContent(draftContent, lineEnding)
  return {
    dirty: draftContent !== displayedContent,
    contentToWrite,
  }
}

// Files writes to one path run one after another, in the order they were asked for: an older autosave can never land
// after a newer save of the same file. The map holds the tail of each path's chain.
const writeChains = new Map<string, Promise<void>>()

/** Resolves once every Files write to this path asked for so far has finished. */
export const waitForFilesViewWrites = async (path: string): Promise<void> => {
  for (let tail = writeChains.get(path); tail; tail = writeChains.get(path)) {
    await tail
  }
}

export const saveFilesViewDraft = async (input: {
  path: string
  draftContent: string
  displayedContent: string
  lineEnding: FileLineEnding
  writeFile?: FilesViewDraftWrite
  options?: { allowOutsideWorkspace?: boolean; directory?: string }
}): Promise<{ ok: true; skipped: boolean } | { ok: false; reason: "unsupported" | "write-failed" }> => {
  if (typeof input.writeFile !== "function") {
    return { ok: false, reason: "unsupported" }
  }
  const prepared = prepareFilesViewDraft(input.draftContent, input.displayedContent, input.lineEnding)
  if (!prepared.dirty) {
    return { ok: true, skipped: true }
  }
  const writeFile = input.writeFile
  const previous = writeChains.get(input.path) ?? Promise.resolve()
  const write = previous.then(() => writeFile(input.path, prepared.contentToWrite, input.options))
  const tail = write.then(
    () => undefined,
    () => undefined,
  )
  writeChains.set(input.path, tail)
  void tail.then(() => {
    if (writeChains.get(input.path) === tail) writeChains.delete(input.path)
  })
  const result = await write
  if (!result?.success) {
    return { ok: false, reason: "write-failed" }
  }
  return { ok: true, skipped: false }
}
