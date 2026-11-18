import { createAtomicJsonWriter, parseJsonObject } from "../../../../../shared/json-file.cjs"

const FILE_VERSION = 1
const MAX_PROMPT_TEXT_LENGTH = 200_000
const PROMPT_ID_PATTERN = /^[a-z0-9._-]{1,160}$/
const isVisiblePromptID = (id) => typeof id === "string" && id.endsWith(".visible")
const normalizePromptID = (id) => (typeof id === "string" ? id.trim() : "")

const overridesToMap = (value) => {
  const overrides = new Map()
  if (value === undefined) return overrides
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Magic prompts data is corrupted")

  for (const [key, entry] of Object.entries(value)) {
    if (!PROMPT_ID_PATTERN.test(key) || typeof entry !== "string") {
      continue
    }
    overrides.set(key, entry)
  }
  return overrides
}

const serializeState = (overrides) => ({
  version: FILE_VERSION,
  overrides: Object.fromEntries(overrides),
})

export const createMagicPromptRuntime = (dependencies) => {
  const { fsPromises, filePath } = dependencies
  const writeJsonFile = createAtomicJsonWriter({ filesystem: fsPromises })

  let writeLock = Promise.resolve()

  const readOverrides = async () => {
    let raw
    try {
      raw = await fsPromises.readFile(filePath, "utf8")
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        return new Map()
      }
      throw error
    }

    const { overrides } = parseJsonObject(raw, "Magic prompts")
    return overridesToMap(overrides)
  }

  const readPromptState = async () => serializeState(await readOverrides())

  const save = (getNextState) => {
    const run = async () => {
      const snapshot = serializeState(await getNextState())
      await writeJsonFile(filePath, snapshot)
      return snapshot
    }
    writeLock = writeLock.then(run, run)
    return writeLock
  }

  const persist = (mutator) => save(async () => mutator(await readOverrides()))

  const setOverride = async (id, text) => {
    const normalizedId = normalizePromptID(id)
    if (!PROMPT_ID_PATTERN.test(normalizedId)) {
      throw new Error("Invalid prompt id")
    }
    if (typeof text !== "string") {
      throw new Error("Prompt text must be a string")
    }
    if (isVisiblePromptID(normalizedId) && text.trim().length === 0) {
      throw new Error("Visible prompt text cannot be empty")
    }
    if (text.length > MAX_PROMPT_TEXT_LENGTH) {
      throw new Error("Prompt text is too long")
    }

    return persist((overrides) => overrides.set(normalizedId, text))
  }

  const resetOverride = async (id) => {
    const normalizedId = normalizePromptID(id)
    if (!PROMPT_ID_PATTERN.test(normalizedId)) {
      throw new Error("Invalid prompt id")
    }

    return persist((overrides) => {
      overrides.delete(normalizedId)
      return overrides
    })
  }

  const resetAllOverrides = async () => {
    // Deliberately does not read first. This is the operation whose purpose is to replace the file, and the
    // read refuses a file it cannot parse — so going through `persist` left a truncated file with no way to
    // clear it from the app at all (`setOverride`, `resetOverride` and the read all answered the same
    // error). It writes under the same lock as every other write.
    return save(() => new Map())
  }

  return {
    readPromptState,
    setOverride,
    resetOverride,
    resetAllOverrides,
  }
}
