import { isPlainRecord } from "./record"

export type PersistedFieldReader<Value> = (value: unknown, current: Value) => Value
export type PersistedFieldReaders<State> = Partial<{ [Key in keyof State]: PersistedFieldReader<State[Key]> }>

export const hasPersistedFields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  isPlainRecord(value) && keys.some(key => Object.hasOwn(value, key))

/** One data-field contract owns both serialization and hydration. Actions are always live code. */
export const createPersistedFields = <State extends object>(fields: PersistedFieldReaders<State>) => {
  const keys = Object.keys(fields) as Array<Extract<keyof State, string>>
  return {
    partialize: (state: State): Partial<State> => {
      const selected: Partial<State> = {}
      for (const key of keys) {
        if (!Object.hasOwn(state, key) || typeof state[key] === "function") continue
        const read = fields[key]
        if (read)
          Object.defineProperty(selected, key, {
            value: read(state[key], state[key]),
            enumerable: true,
            writable: true,
            configurable: true,
          })
      }
      return selected
    },
    merge: (persisted: unknown, current: State): State => {
      if (!hasPersistedFields(persisted, keys)) return current
      const next = { ...current }
      for (const key of keys) {
        if (!Object.hasOwn(persisted, key) || !Object.hasOwn(current, key) || typeof current[key] === "function")
          continue
        const read = fields[key]
        if (read) next[key] = read(persisted[key], current[key])
      }
      return next
    },
  }
}

export const persistedBoolean: PersistedFieldReader<boolean> = (value, current) =>
  typeof value === "boolean" ? value : current
export const persistedString: PersistedFieldReader<string> = (value, current) =>
  typeof value === "string" ? value : current
export const persistedNullableString: PersistedFieldReader<string | null> = (value, current) =>
  value === null || typeof value === "string" ? value : current
export const persistedOptionalString: PersistedFieldReader<string | undefined> = (value, current) =>
  value === undefined || typeof value === "string" ? value : current
export const persistedNumber: PersistedFieldReader<number> = (value, current) =>
  typeof value === "number" && Number.isFinite(value) ? value : current
export const persistedNullableNumber: PersistedFieldReader<number | null> = (value, current) =>
  value === null || (typeof value === "number" && Number.isFinite(value)) ? value : current

export const persistedEnum =
  <Value extends string>(values: readonly Value[]): PersistedFieldReader<Value> =>
  (value, current) =>
    typeof value === "string" && values.includes(value as Value) ? (value as Value) : current

export const persistedStringList: PersistedFieldReader<string[]> = (value, current) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : current

export const persistedRecord =
  <Value>(
    parse: (value: unknown) => Value | undefined,
    maxEntries = Number.POSITIVE_INFINITY,
  ): PersistedFieldReader<Record<string, Value>> =>
  (value, current) => {
    if (!isPlainRecord(value)) return current
    const entries: Array<[string, Value]> = []
    for (const [key, raw] of Object.entries(value)) {
      const parsed = parse(raw)
      if (parsed !== undefined) entries.push([key, parsed])
    }
    return Object.fromEntries(entries.slice(-maxEntries))
  }

export const persistedStringRecord = persistedRecord((value) => (typeof value === "string" ? value : undefined))
