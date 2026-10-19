import type { MultiRunIdentity } from "@/lib/multirun/identity"

/**
 * Group identity for a multi-run compare view. A run group (`g2`) keeps its own
 * lanes so two batches that share a slug are not mixed. Fusion sessions are not lanes.
 */
export type MultiRunTitleIdentity = {
  groupSlug: string
  runGroup?: string
  providerID: string
  modelID: string
  index?: number
  fusion: boolean
}

export type MultiRunLane<T> = T & {
  laneLabel: string
}

export type MultiRunGroup<T> = {
  label: string
  lanes: MultiRunLane<T>[]
}

export type MultiRunTitleParser = (title?: string | null) => MultiRunTitleIdentity | null

/** A row that may carry the validated `metadata.multiRun` identity of its session. */
export type MultiRunRowLike = {
  title?: string | null
  multiRun?: MultiRunIdentity | null
}

/**
 * Prefix of compare keys that come from `metadata.multiRun.groupId`. Title keys are built from
 * slugs of `[a-z0-9-]` and an optional `/gN`, so they never contain ":" and cannot collide.
 */
export const MULTI_RUN_METADATA_KEY_PREFIX = "multirun:"

/** Compare-view key for one parsed lane. Null for fusion sessions and titles that are not multi-run. */
export function multiRunGroupKeyFromParsed(parsed: MultiRunTitleIdentity | null): string | null {
  if (!parsed || parsed.fusion) return null
  return parsed.runGroup ? `${parsed.groupSlug}/${parsed.runGroup}` : parsed.groupSlug
}

export function multiRunLaneLabel(parsed: Pick<MultiRunTitleIdentity, "providerID" | "modelID" | "index">): string {
  const base = `${parsed.providerID}/${parsed.modelID}`
  return parsed.index ? `${base} #${parsed.index}` : base
}

/**
 * Compare-view key for a row: the metadata group when the session records one, otherwise the key
 * parsed from the title. Null for fusion sessions and rows that are not multi-run lanes.
 */
export function multiRunGroupKey(
  identity: MultiRunIdentity | null | undefined,
  parsed: MultiRunTitleIdentity | null,
): string | null {
  if (parsed?.fusion) return null
  if (identity) return `${MULTI_RUN_METADATA_KEY_PREFIX}${identity.groupId}`
  return multiRunGroupKeyFromParsed(parsed)
}

export function multiRunGroupKeyForRow(row: MultiRunRowLike, parse: MultiRunTitleParser): string | null {
  return multiRunGroupKey(row.multiRun, parse(row.title))
}

const groupLabel = (parsed: MultiRunTitleIdentity): string =>
  parsed.runGroup ? `${parsed.groupSlug} · ${parsed.runGroup}` : parsed.groupSlug

type PendingLane<T> = {
  lane: MultiRunLane<T>
  variantId: string | null
  /** The label came from `metadata.multiRun.model`, which carries no duplicate index. */
  modelFromMetadata: boolean
}

type PendingGroup<T> = {
  label: string | null
  fallbackLabel: string
  lanes: PendingLane<T>[]
}

/**
 * Metadata labels carry no duplicate index, so two lanes running the same model get `#1`, `#2` in
 * variant order, as their titles would.
 */
function disambiguateMetadataLabels<T>(lanes: PendingLane<T>[]): void {
  const byLabel = new Map<string, PendingLane<T>[]>()
  for (const entry of lanes) {
    if (!entry.modelFromMetadata) continue
    const list = byLabel.get(entry.lane.laneLabel)
    if (list) list.push(entry)
    else byLabel.set(entry.lane.laneLabel, [entry])
  }
  for (const [label, list] of byLabel) {
    if (list.length < 2) continue
    list.sort((left, right) =>
      (left.variantId ?? "").localeCompare(right.variantId ?? "", undefined, { numeric: true }),
    )
    list.forEach((entry, index) => {
      entry.lane.laneLabel = `${label} #${index + 1}`
    })
  }
}

/**
 * Group supervision rows that belong to a multi-run batch. A row whose session records
 * `metadata.multiRun` is keyed by its `groupId` (prefixed with `multirun:`), so renamed lanes stay
 * together and two launches that share a name stay apart. Rows without that metadata fall back to
 * the title key: the group slug, or `slug/runGroup` when the title carries a run group. Fusion
 * sessions are left out.
 */
export function groupMultiRunRows<T extends MultiRunRowLike>(
  rows: readonly T[],
  parse: MultiRunTitleParser,
): Map<string, MultiRunGroup<T>> {
  const pending = new Map<string, PendingGroup<T>>()
  for (const row of rows) {
    const parsed = parse(row.title)
    const identity = row.multiRun ?? null
    const key = multiRunGroupKey(identity, parsed)
    if (!key) continue

    const modelFromMetadata = Boolean(identity?.model)
    const laneLabel = identity?.model ?? (parsed ? multiRunLaneLabel(parsed) : (row.title ?? "").trim() || key)
    const entry: PendingLane<T> = {
      lane: { ...row, laneLabel },
      variantId: identity?.variantId ?? null,
      modelFromMetadata,
    }

    const existing = pending.get(key)
    const label = parsed ? groupLabel(parsed) : null
    if (existing) {
      existing.lanes.push(entry)
      if (!existing.label && label) existing.label = label
    } else {
      pending.set(key, {
        label,
        fallbackLabel: (row.title ?? "").trim() || key,
        lanes: [entry],
      })
    }
  }

  const groups = new Map<string, MultiRunGroup<T>>()
  for (const [key, group] of pending) {
    disambiguateMetadataLabels(group.lanes)
    const lanes = group.lanes.map((entry) => entry.lane)
    lanes.sort((left, right) => left.laneLabel.localeCompare(right.laneLabel))
    groups.set(key, { label: group.label ?? group.fallbackLabel, lanes })
  }
  return groups
}
